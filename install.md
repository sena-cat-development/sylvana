# Guía de Instalación — Sena-transcripcion

Guía paso a paso para instalar y configurar el proyecto en **Windows** y **Linux**.

---

## Requisitos previos

Antes de comenzar, necesitás tener instalado lo siguiente:

| Requisito | Versión mínima | Cómo verificar |
|-----------|---------------|----------------|
| **Node.js** | v18+ | `node --version` |
| **Python** | 3.10+ | `python --version` |
| **pip** | Último estable | `pip --version` |
| **Git** | Cualquiera | `git --version` |

### Instalar Node.js

Descargalo desde [nodejs.org](https://nodejs.org/) (recomendado: versión LTS).

En Linux (Debian/Ubuntu):
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

### Instalar Python

Descargalo desde [python.org](https://www.python.org/downloads/).

En Linux (Debian/Ubuntu):
```bash
sudo apt update
sudo apt install python3 python3-pip python3-venv
```

### Verificá si tenés GPU NVIDIA (opcional pero recomendado)

**Windows:**
- Abrí el Administrador de tareas → pestaña **Rendimiento** → mirá si aparece **GPU** con marca NVIDIA.
- O ejecutá en la terminal: `nvidia-smi`

**Linux:**
```bash
nvidia-smi
```

- Si el comando muestra información de la GPU → tenés NVIDIA con drivers instalados ✅
- Si dice "command not found" o da error → no tenés GPU NVIDIA o no tiene drivers.

> **Importante:** Si tenés GPU NVIDIA, necesitás tener instalados los drivers actualizados y **CUDA Toolkit 12.x**. Descargalo desde [NVIDIA CUDA](https://developer.nvidia.com/cuda-downloads).

---

## Paso 1 — Clonar el repositorio

```bash
git clone https://github.com/MarcosBaez42/Sena-transcripcion.git
cd Sena-transcripcion
```

---

## Paso 2 — Instalar dependencias de Node.js

```bash
npm install
```

Esto instala los paquetes necesarios: `@google/generative-ai`, `dotenv`, `express`, `docxtemplater`, etc.

---

## Paso 3 — Crear entorno virtual de Python

El entorno virtual aísla las dependencias del proyecto del resto del sistema.

### Windows:
```bash
python -m venv venv
venv\Scripts\activate
```

### Linux / macOS:
```bash
python3 -m venv venv
source venv/bin/activate
```

> Sabrás que el entorno está activo cuando veas `(venv)` al inicio de la línea de comandos.

---

## Paso 4 — Instalar dependencias de Python

Elegí la opción que corresponda a tu hardware:

### Opción A: Tenés GPU NVIDIA con CUDA ✅ (Recomendado)

La transcripción será mucho más rápida usando la GPU.

**Windows:**
```bash
pip install torch==2.5.1+cu121 torchaudio==2.5.1+cu121 torchvision==0.20.1+cu121 --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt
```

**Linux:**
```bash
pip install torch==2.5.1+cu121 torchaudio==2.5.1+cu121 torchvision==0.20.1+cu121 --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt
```

> **Nota:** Al instalar PyTorch primero con CUDA, pip puede advertir sobre versiones conflictivas al instalar `requirements.txt`. Podés ignorar esas advertencias; la versión de PyTorch ya instalada se mantendrá.

### Opción B: No tenés GPU NVIDIA (GPU AMD, Intel, o sin GPU)

La transcripción funcionará en CPU, será más lenta pero completamente funcional.

**Windows:**
```bash
pip install torch torchaudio torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```

**Linux:**
```bash
pip install -r requirements-linux.txt
```

> `requirements-linux.txt` usa versiones de PyTorch sin CUDA, ideales para CPU o servidores sin GPU NVIDIA.

### Verificar que PyTorch detecta tu hardware

```bash
python -c "import torch; print('CUDA disponible:', torch.cuda.is_available()); print('Dispositivo:', 'cuda' if torch.cuda.is_available() else 'cpu')"
```

- Si dice `CUDA disponible: True` → GPU detectada correctamente ✅
- Si dice `CUDA disponible: False` → Se usará CPU (igual funciona, solo más lento)

---

## Paso 5 — Configurar las variables de entorno

### 5.1. Copiar el archivo de ejemplo

**Windows:**
```bash
copy .env.example .env
```

**Linux / macOS:**
```bash
cp .env.example .env
```

### 5.2. Editar el archivo `.env`

Abrí el archivo `.env` con tu editor favorito y completá los valores:

```env
# ─── Obligatorias ─────────────────────────────────────

# Clave API de Google Gemini (obtenela en https://aistudio.google.com/apikey)
GEMINI_API_KEY=tu_api_key_de_gemini_aqui

# Token de Hugging Face (obtenelo en https://huggingface.co/settings/tokens)
# Necesitás aceptar las condiciones de uso del modelo pyannote en:
#   https://huggingface.co/pyannote/speaker-diarization-3.1
#   https://huggingface.co/pyannote/segmentation-3.0
HF_TOKEN=tu_token_de_huggingface_aqui

# ─── Institucionales (ajustá según tu centro) ─────────

INSTITUCION=SENA
CENTRO=Centro Agroturístico
REGION=Santander
COORDINADOR_ACADEMICO=NOMBRE_DEL_COORDINADOR_ACADEMICO
BIENESTAR_APRENDIZ=NOMBRE_DEL_BIENESTAR_APRENDIZ

# ─── Opcional (valores por defecto razonables) ─────────

MODELO_GEMINI=gemini-3.1-flash-lite-preview
DIRECTORIO_ACTAS=.actas_gemini
GUARDAR_VERSIONES=true
NUMERO_VERSIONES=2
MODO_DETALLADO=true
QUIET_MODE=false

# ─── GPU (opcional, se auto-detecta) ───────────────────
# Descomenta solo si necesitás forzar un valor:
# CUDA_VISIBLE_DEVICES=0
# DEVICE=cuda
# BATCH_SIZE=4
# COMPUTE_TYPE=float16
```

### 5.3. Obtener las claves API

**Google Gemini:**
1. Andá a [Google AI Studio](https://aistudio.google.com/apikey)
2. Iniciá sesión con tu cuenta de Google
3. Hacé clic en **"Create API Key"**
4. Copiá la clave y pegala en `GEMINI_API_KEY`

**Hugging Face:**
1. Registrate en [huggingface.co](https://huggingface.co/join)
2. Andá a [Settings → Access Tokens](https://huggingface.co/settings/tokens)
3. Creá un token con permisos de **Read**
4. Aceptá las condiciones de uso de los modelos:
   - [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
   - [pyannote/segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0)
5. Copiá el token y pegalo en `HF_TOKEN`

---

## Paso 6 — (Opcional) Instalar modelo spaCy para detección de nombres

Esto mejora la detección automática de nombres de hablantes en las transcripciones:

```bash
python -m spacy download es_core_news_sm
```

---

## Paso 7 — Verificar la instalación

Ejecutá este comando para confirmar que todo está en orden:

```bash
python -c "import torch; import whisperx; print('✅ Todas las dependencias de Python OK')"
```

Y verificá que Node.js funciona:

```bash
node -e "require('dotenv').config(); console.log('✅ Node.js OK')"
```

---

## Comandos disponibles

Una vez instalado, podés usar estos comandos:

| Comando | Descripción |
|---------|-------------|
| `npm run transcribir` | Procesa los audios y genera archivos de transcripción |
| `npm run generar-acta` | Crea un acta a partir de una transcripción |
| `npm run generar-acta [--articulos=...]` | Genera acta citando artículos del reglamento |
| `npm run corregir-transcripcion -- ruta/archivo.txt` | Corrige ortografía de una transcripción |
| `npm run preprocesar` | Preprocesa archivos de audio |
| `npm run start-server` | Inicia el servidor web con interfaz |

### Asignar nombres de hablantes

Después de transcribir:
```bash
python src/python/gestionar_nombres.py ruta/al/archivo_transcripcion.txt
```

### Extraer reglamento del PDF

```bash
python scripts/extraer_reglamento.py ruta/al/Reglamento.pdf config/reglamento.json
```

---

## Solución de problemas

### Error: `torch.cuda.is_available()` devuelve `False`

- Verificá que tenés drivers NVIDIA actualizados: `nvidia-smi`
- Reinstalá PyTorch con soporte CUDA (Opción A del Paso 4)
- Verificá que tu GPU sea compatible con CUDA (la mayoría de las NVIDIA lo son)

### Error: `No module named 'whisperx'`

- Asegurate de que el entorno virtual esté activado: debe aparecer `(venv)` en la terminal
- Ejecutá `pip install -r requirements.txt` nuevamente

### Error: `CUDA out of memory`

- Editá `.env` y descomenta `BATCH_SIZE=1` para usar menos memoria de GPU
- O forzá el uso de CPU: descomenta `DEVICE=cpu`

### Error de autenticación con Hugging Face

- Verificá que `HF_TOKEN` esté correcto en `.env`
- Asegurate de haber aceptado las condiciones de uso de los modelos pyannote en Hugging Face

### Error: `GEMINI_API_KEY` no configurada

- Verificá que el archivo `.env` exista en la raíz del proyecto
- Asegurate de que `GEMINI_API_KEY` tenga un valor válido (no vacío)

---

## Estructura del proyecto

```
Sena-transcripcion/
├── .env.example          # Plantilla de variables de entorno
├── package.json          # Dependencias Node.js
├── requirements.txt      # Dependencias Python (Windows/CUDA)
├── requirements-linux.txt # Dependencias Python (Linux/CPU)
├── config/               # Configuración y plantillas
│   ├── config_transcritor.json
│   ├── plantilla.docx
│   ├── reglamento.json
│   └── hablantes.json
├── public/               # Interfaz web
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── scripts/              # Scripts auxiliares
├── src/
│   ├── js/               # Scripts Node.js (transcripción, actas)
│   ├── python/           # Transcriptor WhisperX
│   └── server/           # Servidor web Express
└── transcripciones/      # (se crea al usar) Transcripciones generadas
```
