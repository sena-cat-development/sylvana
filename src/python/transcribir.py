# Script de Transcripción para el SENA

"""Herramienta de línea de comandos para transcribir audios."""

import argparse
import builtins
import io
import json
import os
import re
import sys
import time
import warnings

from typing import Optional, Tuple

from utilidades_nombres import cargar_json, guardar_json

try:  # noqa: WPS440 - se desea informar errores al usuario final
    import torch
    import whisperx
    from whisperx.diarize import DiarizationPipeline
except ImportError as exc:  # pragma: no cover - se ejecuta antes de las pruebas
    print(f"❌ Me faltan librerías: {exc}")
    print("💡 Instala con: pip install whisperx")
    sys.exit(1)


def cargar_config() -> dict:
    """Lee config_transcritor.json desde la raíz del proyecto."""
    ruta_script = os.path.abspath(__file__)
    raiz = os.path.dirname(os.path.dirname(os.path.dirname(ruta_script)))
    config_path = os.path.join(raiz, "config", "config_transcritor.json")
    try:
        with open(config_path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        print(f"⚠️ No pude leer config_transcritor.json: {exc}. Usando valores por defecto.")
        return {}


TAMANO_LOTE_DEF = 8
TIPO_COMPUTO_DEF = "float16"
TIPOS_PERMITIDOS = {
    "float16",
    "float32",
    "int8",
    "int8_float16",
    "int8_float32",
}


progreso = 0


def avanzar(paso: int) -> None:
    """Incrementa y muestra el avance del proceso."""

    global progreso
    progreso += paso
    print(progreso, flush=True)


def parse_args() -> argparse.Namespace:
    """Define y analiza los argumentos de la línea de comandos."""

    parser = argparse.ArgumentParser(description="Script de transcripción para el SENA")
    parser.add_argument("audio_file", help="Archivo de audio a transcribir")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=None,
        help="Tamaño del lote (auto según VRAM si no se especifica)",
    )
    parser.add_argument(
        "--compute-type",
        default=None,
        help="Tipo de cómputo: float16, float32, int8, int8_float16 (auto si no se especifica)",
    )
    parser.add_argument(
        "--device",
        default=os.getenv("DEVICE"),
        help="Dispositivo a utilizar (cpu, cuda)",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Modo silencioso",
    )
    return parser.parse_args()


def setup_environment(args: argparse.Namespace) -> Tuple[Optional[str], str]:
    """Configura variables de entorno y selecciona el dispositivo."""

    quiet_env = os.getenv("QUIET_MODE", "").lower() not in ("", "0", "false", "no")
    if args.quiet or quiet_env:
        builtins.print = lambda *a, **k: None  # noqa: WPS121

    token_hf = os.getenv("HF_TOKEN")
    if not token_hf:
        print("⚠️  Variable HF_TOKEN no configurada; la diarización no se ejecutará.")
        print("💡  Configura tu token con: export HF_TOKEN=tu_token_de_huggingface")

    device_solicitado = args.device or ("cuda" if torch.cuda.is_available() else "cpu")
    device = validar_gpu() if device_solicitado == "cuda" else device_solicitado

    os.environ["PYTHONIOENCODING"] = "utf-8"
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

    warnings.filterwarnings("ignore", category=UserWarning)
    warnings.filterwarnings("ignore", category=FutureWarning)

    return token_hf, device


def validar_gpu() -> str:
    """Verifica compatibilidad de la GPU con la versión actual de PyTorch.

    Retorna 'cuda' si la GPU es compatible, 'cpu' si no lo es o no hay GPU.
    Blackwell (CC 10.0+) requiere PyTorch 2.6+ con CUDA 12.6+.
    """
    if not torch.cuda.is_available():
        print("ℹ️  No se detectó GPU compatible con CUDA. Usando CPU.")
        return "cpu"

    try:
        nombre_gpu = torch.cuda.get_device_name(0)
        cap_mayor, cap_menor = torch.cuda.get_device_capability(0)
        cuda_torch = torch.version.cuda or "desconocida"
        print(f"🖥️  GPU detectada: {nombre_gpu}")
        print(f"📊  Compute Capability: {cap_mayor}.{cap_menor} | CUDA (PyTorch): {cuda_torch}")

        # Blackwell (CC 10.0+) no es soportado por PyTorch < 2.6 / CUDA < 12.6
        if cap_mayor >= 10:
            print("⚠️  GPU Blackwell detectada (Compute Capability 10.0+).")
            print(f"   PyTorch {torch.__version__} con CUDA {cuda_torch} no la soporta.")
            print("   Solución: reinstala PyTorch con CUDA 12.6:")
            print("   pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu126")
            print("🔄  Usando CPU como alternativa por ahora.")
            return "cpu"

        # Ada Lovelace (RTX 40xx) CC 8.9 — verificar CUDA mínimo 11.8
        if cap_mayor >= 8 and cap_menor >= 9:
            cuda_mayor = int((cuda_torch or "0").split(".")[0])
            if cuda_mayor < 11:
                print(f"⚠️  GPU Ada Lovelace (CC {cap_mayor}.{cap_menor}) requiere CUDA 11.8+.")
                print("🔄  Usando CPU.")
                return "cpu"

        return "cuda"

    except Exception as exc:
        print(f"⚠️  Error verificando GPU: {exc}. Usando CPU.")
        return "cpu"


def calcular_batch_size_optimo(device: str) -> int:
    """Calcula el batch_size según la VRAM disponible."""
    if device != "cuda":
        return 1
    try:
        vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
        print(f"💾  VRAM disponible: {vram_gb:.1f} GB")
        if vram_gb < 4:
            return 2
        elif vram_gb < 8:
            return 4
        elif vram_gb < 16:
            return 8
        return 16
    except Exception:
        return 4


def calcular_compute_type_optimo(device: str) -> str:
    """Selecciona el compute_type más eficiente según la arquitectura de la GPU."""
    if device != "cuda":
        return "int8"
    try:
        cap_mayor, _ = torch.cuda.get_device_capability(0)
        # Volta (7.0+) soporta float16 eficiente; antes mejor int8_float16
        return "float16" if cap_mayor >= 7 else "int8_float16"
    except Exception:
        return "float16"


def _ajustar_tipo_computo(device: str, compute_type: str) -> str:
    """Ajusta el compute_type cuando el dispositivo no soporta float16.

    En CPU, `float16` suele provocar errores como:
    ``ValueError: Requested float16 compute type, but the target device or backend do not support efficient float16 computation.``
    En ese caso forzamos a `float32` para que el modelo cargue correctamente.
    """

    if device == "cpu" and "float16" in compute_type:
        print("⚠️  El dispositivo CPU no soporta float16; usando float32.")
        return "float32"
    return compute_type


def ejecutar_transcripcion(
    audio_file: str,
    device: str,
    batch_size: int,
    compute_type: str,
):
    """Realiza la transcripción y la alineación de palabras."""

    print(f"📁 ¡Perfecto! Encontré el archivo: {audio_file}")
    print("🤖 Cargando el modelo WhisperX...")
    print(" Esto puede tardar un poco la primera vez...")

    if device == "cuda":
        torch.backends.cudnn.benchmark = True
        torch.set_float32_matmul_precision("high")

    compute_type_ajustado = _ajustar_tipo_computo(device, compute_type)

    config = cargar_config()
    nombre_modelo = config.get("modelo", "large")
    try:
        modelo_whisper = whisperx.load_model(nombre_modelo, device, compute_type=compute_type_ajustado)
    except ValueError as exc:
        if "float16" in compute_type_ajustado and device != "cuda":
            print(f"⚠️  {exc}")
            print("🔄 Reintentando con compute_type=float32...")
            modelo_whisper = whisperx.load_model(nombre_modelo, device, compute_type="float32")
        else:
            raise
    print("✅ Modelo cargado correctamente")
    avanzar(10)

    print(f"🎙️ Comenzando transcripción de: {audio_file}")
    try:
        try:
            resultado = modelo_whisper.transcribe(
                audio_file,
                language="es",
                batch_size=batch_size,
                condition_on_previous_text=False,
                no_speech_threshold=0.6,
                logprob_threshold=-1.0,
                compression_ratio_threshold=2.4,
                temperature=0.0,
            )
            print("✅ Transcripción avanzada completada")
        except TypeError as err:
            print(f"⚠️ Parámetros avanzados no funcionaron: {err}")
            print("🔄 Intentando con parámetros básicos...")
            try:
                resultado = modelo_whisper.transcribe(
                    audio_file, language="es", batch_size=batch_size
                )
                print("✅ Transcripción básica completada")
            except TypeError:
                resultado = modelo_whisper.transcribe(audio_file, language="es")
                print("✅ Transcripción mínima completada")
    except Exception as exc:  # noqa: WPS440
        print(f"❌ Error durante la transcripción: {exc}")
        sys.exit(1)

    avanzar(10)

    print("🔤 Alineando palabras para mayor precisión...")
    try:
        modelo_alineacion, metadatos = whisperx.load_align_model(
            language_code="es", device=device
        )
        resultado_alineado = whisperx.align(
            resultado["segments"], modelo_alineacion, metadatos, audio_file, device
        )
        print("✅ Alineación completada correctamente")
        avanzar(10)
    except Exception as exc:  # noqa: WPS440
        print(f"⚠️ Problemas con la alineación: {exc}")
        print("🔄 Continuando sin alineación precisa...")
        resultado_alineado = resultado
        avanzar(10)
    return modelo_whisper, resultado_alineado


def ejecutar_diarizacion(
    resultado_alineado: dict,
    audio_file: str,
    device: str,
    token_hf: Optional[str],
):
    """Aplica la diarización para separar hablantes."""

    segmentos_hablantes = None
    if token_hf:
        print("👥 Aplicando separación de hablantes...")
        try:
            pipeline = DiarizationPipeline(use_auth_token=token_hf, device=device)
            print(f"🖥️ Diarización usando dispositivo: {device}")
            segmentos_hablantes = pipeline(audio_file)
            resultado_alineado = whisperx.assign_word_speakers(
                segmentos_hablantes, resultado_alineado
            )
            for segment in resultado_alineado.get("segments", []):
                speakers = [
                    word.get("speaker")
                    for word in segment.get("words", [])
                    if word.get("speaker")
                ]
                segment["speaker"] = (
                    max(set(speakers), key=speakers.count)
                    if speakers
                    else "DESCONOCIDO"
                )
            print("✅ Separación de hablantes completada")
        except Exception as exc:  # noqa: WPS440
            print(f"⚠️ Problemas con la diarización: {exc}")
            print("🔄 Continuando sin separación de hablantes...")
        avanzar(10)
    else:
        print("⚠️  Se omitirá la diarización porque HF_TOKEN no está configurado.")
        print("💡  Establece la variable de entorno HF_TOKEN para habilitar la separación de hablantes.")
        avanzar(10)

    return resultado_alineado, segmentos_hablantes

def formatear_salida(
    resultado_alineado: dict,
    segmentos_hablantes: Optional[dict],
    nombre_sin_extension: str,
):
    """Procesa el resultado y guarda la transcripción en disco."""

    archivo_nombres = "hablantes.json"
    if not os.path.exists(archivo_nombres):
        print(f"ℹ️ No encontré {archivo_nombres}, crearé uno nuevo")
    mapeo_nombres = cargar_json(archivo_nombres, {})

    archivo_mapeo_global = "mapeo_hablantes_global.json"
    if not os.path.exists(archivo_mapeo_global):
        print("ℹ️ Creando nuevo sistema de mapeo de hablantes")
    hablantes_globales = cargar_json(archivo_mapeo_global, {})
    contador_global = (
        max(
            [
                int(h.split("_")[1])
                for h in hablantes_globales.values()
                if h.startswith("HABLANTE_")
            ],
            default=0,
        )
        + 1
    )

    def asignar_hablante_global(speaker_local: str) -> str:
        nonlocal contador_global, hablantes_globales
        if not speaker_local or speaker_local == "DESCONOCIDO":
            return "DESCONOCIDO"
        if speaker_local in hablantes_globales:
            return hablantes_globales[speaker_local]
        nuevo_hablante = f"HABLANTE_{contador_global}"
        hablantes_globales[speaker_local] = nuevo_hablante
        contador_global += 1
        print(f"🆕 Nuevo hablante detectado: {speaker_local} → {nuevo_hablante}")
        if not guardar_json(archivo_mapeo_global, hablantes_globales):
            print("⚠️ No pude guardar el mapeo")
        return nuevo_hablante

    def obtener_nombre_final(hablante_global: str) -> str:
        if not hablante_global or hablante_global == "DESCONOCIDO":
            return "HABLANTE DESCONOCIDO"
        if hablante_global in mapeo_nombres:
            return mapeo_nombres[hablante_global]
        try:
            if "_" in hablante_global:
                numero = hablante_global.split("_")[1]
                return f"HABLANTE {numero}"
            return f"HABLANTE {hablante_global}"
        except (IndexError, ValueError):
            return f"HABLANTE {hablante_global}"

    def limpiar_texto_repetitivo(texto: str) -> str:
        texto = re.sub(r"\b(no|sí|ah|eh|mm|um)\s*(?:\1\s*){4,}", r"\1 ", texto, flags=re.IGNORECASE)
        texto = re.sub(r"(?:no,?\s*){5,}", "no ", texto, flags=re.IGNORECASE)
        texto = re.sub(r",\s*,\s*,+", ", ", texto)
        texto = re.sub(r"\s+", " ", texto)
        return texto.strip()

    def formatear_texto_final(texto_final: str) -> str:
        print("🎨 Aplicando formato final al texto...")
        patron = r"(INTERVIENE HABLANTE \w+:)"
        partes = re.split(patron, texto_final)
        texto_formateado = ""
        i = 0
        while i < len(partes):
            parte = partes[i].strip()
            if parte.startswith("INTERVIENE HABLANTE"):
                if i + 1 < len(partes):
                    texto_intervencion = partes[i + 1].strip()
                    texto_intervencion = re.sub(r"\s+", " ", texto_intervencion)
                    texto_intervencion = texto_intervencion.strip()
                    if texto_formateado:
                        texto_formateado += "\n\n"
                    texto_formateado += f"{parte} {texto_intervencion}"
                    i += 2
                else:
                    i += 1
            else:
                if parte and not parte.startswith("---"):
                    if texto_formateado and not parte.startswith("INTERVIENE"):
                        texto_formateado += " " + parte
                elif parte.startswith("---"):
                    texto_formateado += f"\n\n{parte}\n\n"
                i += 1
        return texto_formateado.strip()

    def procesar_segmentos_con_hablantes(resultado_proc: dict) -> str:
        segmentos = (
            resultado_proc["segments"] if isinstance(resultado_proc, dict) else resultado_proc
        )
        print(f"🎯 Procesando {len(segmentos)} segmentos de audio...")
        segmentos_procesados = []
        for i, seg in enumerate(segmentos):
            tiempo_inicio = seg.get("start", 0)
            texto_segmento = seg.get("text", "").strip()
            if not texto_segmento:
                continue
            texto_segmento = re.sub(r"\s+", " ", texto_segmento.strip())
            hablante_local = seg.get("speaker") or "DESCONOCIDO"
            if hablante_local != "DESCONOCIDO":
                hablante_global = asignar_hablante_global(hablante_local)
            else:
                hablante_global = "DESCONOCIDO"
            segmentos_procesados.append(
                {
                    "indice": i,
                    "tiempo": tiempo_inicio,
                    "hablante": hablante_global,
                    "texto": texto_segmento,
                }
            )

        for i in range(len(segmentos_procesados)):
            seg_actual = segmentos_procesados[i]
            contexto_anterior = []
            contexto_posterior = []
            for j in range(max(0, i - 3), i):
                contexto_anterior.append(segmentos_procesados[j]["hablante"])
            for j in range(i + 1, min(len(segmentos_procesados), i + 4)):
                contexto_posterior.append(segmentos_procesados[j]["hablante"])
            if contexto_anterior and contexto_posterior and seg_actual["hablante"] != "DESCONOCIDO":
                hablante_anterior = max(set(contexto_anterior), key=contexto_anterior.count)
                hablante_posterior = max(set(contexto_posterior), key=contexto_posterior.count)
                if (
                    hablante_anterior == hablante_posterior
                    and seg_actual["hablante"] != hablante_anterior
                    and hablante_anterior != "DESCONOCIDO"
                ):
                    seg_actual["hablante"] = hablante_anterior

        grupos = []
        grupo_actual = None
        for seg in segmentos_procesados:
            if grupo_actual is None:
                grupo_actual = {
                    "hablante": seg["hablante"],
                    "textos": [seg["texto"]],
                    "tiempo_inicio": seg["tiempo"],
                    "cantidad_segmentos": 1,
                }
            elif seg["hablante"] == grupo_actual["hablante"]:
                grupo_actual["textos"].append(seg["texto"])
                grupo_actual["cantidad_segmentos"] += 1
            else:
                grupos.append(grupo_actual)
                grupo_actual = {
                    "hablante": seg["hablante"],
                    "textos": [seg["texto"]],
                    "tiempo_inicio": seg["tiempo"],
                    "cantidad_segmentos": 1,
                }
        if grupo_actual:
            grupos.append(grupo_actual)

        texto_final = ""
        for grupo in grupos:
            nombre_para_mostrar = obtener_nombre_final(grupo["hablante"])
            texto_del_grupo = " ".join(grupo["textos"])
            texto_del_grupo = limpiar_texto_repetitivo(texto_del_grupo)
            if len(texto_del_grupo) > 3:
                texto_final += f"INTERVIENE {nombre_para_mostrar}: {texto_del_grupo} "
        if not texto_final.strip():
            print("⚠️ No se pudo asignar hablantes, usando método de respaldo...")
            texto_final = "INTERVIENE HABLANTE DESCONOCIDO: "
            for seg in segmentos:
                texto_seg = seg.get("text", "").strip()
                if texto_seg:
                    texto_final += texto_seg + " "
        return texto_final.strip()

    if segmentos_hablantes is not None:
        texto_transcrito_final = procesar_segmentos_con_hablantes(resultado_alineado)
    else:
        print("📝 Sin separación de hablantes, procesando como hablante único...")
        texto_transcrito_final = "INTERVIENE HABLANTE DESCONOCIDO: "
        segmentos = (
            resultado_alineado["segments"] if isinstance(resultado_alineado, dict) else resultado_alineado
        )
        for seg in segmentos:
            texto_seg = seg.get("text", "").strip()
            if texto_seg:
                texto_seg = limpiar_texto_repetitivo(texto_seg)
                if texto_seg.strip():
                    texto_transcrito_final += texto_seg + " "

    texto_transcrito_final = limpiar_texto_repetitivo(texto_transcrito_final)
    texto_transcrito_final = formatear_texto_final(texto_transcrito_final)
    avanzar(10)

    archivo_salida = f"{nombre_sin_extension}_transcripcion.txt"
    with open(archivo_salida, "w", encoding="utf-8") as handle:
        handle.write(texto_transcrito_final)        

    avanzar(10)
    return texto_transcrito_final, archivo_salida

def main() -> None:
    """Punto de entrada principal del script."""

    args = parse_args()
    token_hf, device = setup_environment(args)
    avanzar(10)

    audio_file = args.audio_file
    if not os.path.exists(audio_file):
        print(f"❌ No encontré el archivo: {audio_file}")
        print("💡 Verifica que el nombre y la ruta estén correctos")
        sys.exit(1)

    nombre_sin_extension = audio_file.rsplit(".", 1)[0]
    avanzar(10)

    batch_size = (
        args.batch_size
        or int(os.getenv("BATCH_SIZE", 0))
        or calcular_batch_size_optimo(device)
    )
    compute_type = (
        args.compute_type
        or os.getenv("COMPUTE_TYPE")
        or calcular_compute_type_optimo(device)
    )
    print(f"⚙️  batch_size={batch_size} | compute_type={compute_type} | device={device}")

    tiempo_inicio = time.time()
    modelo_whisper, resultado = ejecutar_transcripcion(
        audio_file, device, batch_size, compute_type
    )
    resultado, segmentos_hablantes = ejecutar_diarizacion(
        resultado, audio_file, device, token_hf
    )
    texto_transcrito_final, archivo_salida = formatear_salida(
        resultado, segmentos_hablantes, nombre_sin_extension
    )

    try:
        del modelo_whisper
        torch.cuda.empty_cache()
    except Exception:
        pass
    avanzar(10)

    tiempo_final = time.time()
    tiempo_total_segundos = round(tiempo_final - tiempo_inicio, 2)
    tiempo_total_minutos = round(tiempo_total_segundos / 60, 2)
    print("✅ ¡Transcripción y separación de hablantes completadas!")
    print(f"⏱️ Tiempo total: {tiempo_total_minutos} minutos")
    print(f"📄 Texto guardado en: {archivo_salida}")
    intervenciones = [
        linea for linea in texto_transcrito_final.split("\n") if linea.strip().startswith("INTERVIENE")
    ]
    print(f"👥 Total de intervenciones detectadas: {len(intervenciones)}")
    avanzar(10)
    print("\n🎉 ¡Proceso completado! Este fue mi aporte al proyecto del SENA.")


if __name__ == "__main__":  
    main()
