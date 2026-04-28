# Guía de Instalación para Windows — Sena-transcripcion

Guía paso a paso para instalar y configurar el proyecto en **Windows 10/11**.

---

## Requisitos previos

Antes de comenzar, necesitás tener instalado lo siguiente:

| Requisito | Versión mínima | Cómo verificar |
|-----------|---------------|----------------|
| **Node.js** | v18+ | Abrí una terminal y ejecutá `node --version` |
| **Python** | 3.10+ | `python --version` |
| **pip** | Último estable | `pip --version` |
| **Git** | Cualquiera | `git --version` |

> **Terminal:** Todos los comandos se ejecutan en **Símbolo del sistema (cmd)** o **PowerShell**. Podés abrirlo con `Win + R` → escribí `cmd` → Enter.

---

## Paso 0 — Instalar los requisitos previos

### 0.1. Instalar Node.js

1. Andá a [nodejs.org](https://nodejs.org/)
2. Descargá la versión **LTS** (recomendada)
3. Ejecutá el instalador `.msi` y seguí los pasos (Next → Next → Install)
4. Verificá abriendo una **nueva** terminal:
```cmd
node --version
```
Debería mostrar algo como `v18.x.x` o superior.

### 0.2. Instalar Python

1. Andá a [python.org/downloads](https://www.python.org/downloads/)
2. Descargá Python 3.10 o superior
3. **⚠️ IMPORTANTE:** En el instalador, marcá la casilla **"Add Python to PATH"** al inicio de la instalación
4. Hacé clic en **"Install Now"**
5. Verificá abriendo una **nueva** terminal:
```cmd
python --version
```

### 0.3. Instalar Git (si no lo tenés)

1. Andá a [git-scm.com/download/win](https://git-scm.com/download/win)
2. Descargá e instalá con las opciones por defecto
3. Verificá:
```cmd
git --version
```

### 0.4. Verificá si tenés GPU NVIDIA

Esto es importante para elegir la opción correcta en el Paso 4.

1. Presioná `Ctrl + Shift + Esc` para abrir el **Administrador de tareas**
2. Andá a la pestaña **Rendimiento**
3. Mirá si aparece una sección **GPU** que diga **NVIDIA**

O ejecutá en la terminal:
```cmd
nvidia-smi
```

- ✅ Si muestra una tabla con información de tu GPU → **Tenés NVIDIA con drivers**. Anotá la versión de CUDA que aparece.
- ❌ Si dice `"nvidia-smi" no se reconoce` → **No tenés GPU NVIDIA** o no tiene drivers.

> **Si tenés GPU NVIDIA:** Asegurate de tener los drivers actualizados. Descargalos desde [NVIDIA Driver Downloads](https://www.nvidia.com/Download/index.aspx). También necesitás **CUDA Toolkit 12.x** desde [developer.nvidia.com/cuda-downloads](https://developer.nvidia.com/cuda-downloads).

---

## Paso 1 — Clonar el repositorio

Abrí una terminal en la carpeta donde querés instalar el proyecto y ejecutá:

```cmd
git clone https://github.com/MarcosBaez42/Sena-transcripcion.git
cd Sena-transcripcion
```

---

## Paso 2 — Instalar dependencias de Node.js

```cmd
npm install
```

Esto instala los paquetes necesarios: `@google/generative-ai`, `dotenv`, `express`, `docxtemplater`, etc.

> Si da error, verificá que Node.js esté instalado correctamente con `node --version`.

---

## Paso 3 — Crear entorno virtual de Python

El entorno virtual aísla las dependencias del proyecto del resto del sistema.

```cmd
python -m venv venv
```

**Activar el entorno virtual:**

```cmd
venv\Scripts\activate
```

> ✅ Sabrás que funcionó cuando veas `(venv)` al inicio de la línea de comandos.
>
> ⚠️ **Cada vez que abras una nueva terminal** para trabajar en el proyecto, necesitás activar el entorno virtual con `venv\Scripts\activate`.

---

## Paso 4 — Instalar dependencias de Python

Elegí **UNA** de las siguientes opciones según tu hardware:

### Opción A: Tenés GPU NVIDIA con CUDA ✅ (Recomendado — más rápido)

La transcripción se procesará en la GPU, siendo **5-10 veces más rápida**.

```cmd
pip install torch==2.5.1+cu121 torchaudio==2.5.1+cu121 torchvision==0.20.1+cu121 --index-url https://download.pytorch.org/whl/cu121
```

Esperá a que termine (puede tardar varios minutos). Luego:

```cmd
pip install -r requirements.txt
```

> **Nota:** pip puede mostrar advertencias sobre conflictos de versión con PyTorch al ejecutar el segundo comando. **Ignoralas** — la versión con CUDA que ya instalaste se mantendrá.

### Opción B: No tenés GPU NVIDIA (solo CPU)

La transcripción funcionará igual, pero será más lenta.

```cmd
pip install torch torchaudio torchvision --index-url https://download.pytorch.org/whl/cpu
```

Luego:

```cmd
pip install -r requirements.txt
```

### Verificar que PyTorch detecta tu hardware

Después de instalar todo, verificá con:

```cmd
python -c "import torch; print('CUDA disponible:', torch.cuda.is_available()); print('Dispositivo:', 'cuda' if torch.cuda.is_available() else 'cpu')"
```

- `CUDA disponible: True` → ✅ GPU detectada correctamente
- `CUDA disponible: False` → Se usará CPU (funciona, solo más lento)

---

## Paso 5 — Configurar las variables de entorno

### 5.1. Copiar el archivo de ejemplo

```cmd
copy .env.example .env
```

### 5.2. Editar el archivo `.env`

Abrí el archivo `.env` con el Bloc de notas o tu editor favorito:

```cmd
notepad .env
```

Completá los valores obligatorios:

```env
# ─── OBLIGATORIAS ─────────────────────────────────────

# Clave API de Google Gemini
GEMINI_API_KEY=tu_api_key_de_gemini_aqui

# Token de Hugging Face
HF_TOKEN=tu_token_de_huggingface_aqui

# ─── INSTITUCIONALES (ajustá según tu centro) ─────────

INSTITUCION=SENA
CENTRO=Centro Agroturístico
REGION=Santander
COORDINADOR_ACADEMICO=NOMBRE_DEL_COORDINADOR_ACADEMICO
BIENESTAR_APRENDIZ=NOMBRE_DEL_BIENESTAR_APRENDIZ

# ─── OPCIONAL (valores por defecto razonables) ─────────

MODELO_GEMINI=gemini-3.1-flash-lite-preview
DIRECTORIO_ACTAS=.actas_gemini
GUARDAR_VERSIONES=true
NUMERO_VERSIONES=2
MODO_DETALLADO=true
QUIET_MODE=false
```

Guardá el archivo (`Ctrl + S`) y cerrá el Bloc de notas.

### 5.3. Cómo obtener las claves API

#### Google Gemini (OBLIGATORIA)

1. Andá a [Google AI Studio](https://aistudio.google.com/apikey)
2. Iniciá sesión con tu cuenta de Google
3. Hacé clic en **"Create API Key"**
4. Copiá la clave y pegala como valor de `GEMINI_API_KEY` en `.env`

#### Hugging Face (OBLIGATORIA)

1. Registrate en [huggingface.co/join](https://huggingface.co/join)
2. Andá a [Settings → Access Tokens](https://huggingface.co/settings/tokens)
3. Hacé clic en **"New token"** → tipo **Read** → copialo
4. **⚠️ IMPORTANTE:** Tenés que aceptar las condiciones de uso de estos modelos:
   - [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1) → hacé clic en **"Agree and access repository"**
   - [pyannote/segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0) → hacé clic en **"Agree and access repository"**
5. Pegá el token como valor de `HF_TOKEN` en `.env`

---

## Paso 6 — Instalar modelo spaCy para detección de nombres (Recomendado)

Esto permite que el sistema detecte automáticamente nombres de hablantes en las transcripciones.

Primero instalá spaCy (ya debería estar incluido en el requirements.txt, pero por si acaso):

```cmd
pip install spacy
```

Luego descargá el modelo en español:

```cmd
python -m spacy download es_core_news_sm
```

> **Si este comando da error `"No module named spacy"`:** Asegurate de que el entorno virtual esté activado (debe aparecer `(venv)` en la terminal). Ejecutá `venv\Scripts\activate` y volvé a intentar.
>
> **Si no querés instalar spaCy:** El sistema funciona igual, pero usará una heurística con expresiones regulares para detectar nombres (menos precisa).
---

## Paso 7 — Verificar la instalación

Ejecutá estos comandos para confirmar que todo está en orden:

**Verificar Python y dependencias:**
```cmd
python -c "import torch; import whisperx; print('Python OK - CUDA:', torch.cuda.is_available())"
```

**Verificar Node.js:**
```cmd
node -e "require('dotenv').config(); console.log('Node.js OK')"
```

Si ambos comandos no muestran errores, la instalación está completa. ✅

---

## Comandos disponibles

Una vez instalado, podés usar estos comandos **desde la raíz del proyecto** (con el entorno virtual activado):

| Comando | Descripción |
|---------|-------------|
| `npm run transcribir` | Procesa los audios y genera archivos de transcripción |
| `npm run generar-acta` | Crea un acta a partir de una transcripción |
| `npm run generar-acta-partes` | Genera acta completa a partir de uno o dos archivos |
| `npm run corregir-transcripcion -- transcripciones\archivo.txt` | Corrige ortografía de una transcripción |
| `npm run preprocesar` | Preprocesa archivos de audio |
| `npm run start-server` | Inicia el servidor web con interfaz |

### Asignar nombres de hablantes

Después de transcribir un audio:
```cmd
python src\python\gestionar_nombres.py transcripciones\mi_transcripcion.txt
```

### Extraer reglamento del PDF

```cmd
python scripts\extraer_reglamento.py scripts\REGLAMENTO_DEL_APRENDIZ.pdf config\reglamento.json
```

---

## Solución de problemas

### `"No module named 'spacy'"`

spaCy no está instalado. Activá el entorno virtual e instalalo:

```cmd
venv\Scripts\activate
pip install spacy
python -m spacy download es_core_news_sm
```

### `"No module named 'whisperx'"`

El entorno virtual no está activado o faltan dependencias:

```cmd
venv\Scripts\activate
pip install -r requirements.txt
```

### `torch.cuda.is_available()` devuelve `False` pero tenés GPU NVIDIA

1. Verificá los drivers: ejecutá `nvidia-smi`
   - Si no funciona → instalá los drivers desde [NVIDIA](https://www.nvidia.com/Download/index.aspx)
2. Reinstalá PyTorch con soporte CUDA:
```cmd
pip uninstall torch torchaudio torchvision
pip install torch==2.5.1+cu121 torchaudio==2.5.1+cu121 torchvision==0.20.1+cu121 --index-url https://download.pytorch.org/whl/cu121
```

### `CUDA out of memory` (sin memoria en GPU)

Editá `.env` y descomenta estas líneas (borrá el `#`):

```env
BATCH_SIZE=1
DEVICE=cpu
```

Esto fuerza el uso de CPU para evitar el error de memoria.

### Error de autenticación con Hugging Face

- Verificá que `HF_TOKEN` esté correcto en `.env` (sin espacios extra)
- Asegurate de haber aceptado las condiciones de uso en:
  - [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
  - [pyannote/segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0)

### `"GEMINI_API_KEY" no está configurada`

- Verificá que el archivo `.env` exista en la raíz del proyecto
- Asegurate de que `GEMINI_API_KEY` tenga un valor válido

### Error al activar el entorno virtual

Si `venv\Scripts\activate` no funciona en PowerShell por política de ejecución:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Luego volvé a ejecutar `venv\Scripts\activate`.

O alternativamente usá **Símbolo del sistema (cmd)** en lugar de PowerShell.

---

## Estructura del proyecto

```
Sena-transcripcion/
├── .env.example          # Plantilla de variables de entorno
├── .env                  # TU configuración (NO se sube a Git)
├── install.md            # Guía de instalación (Linux)
├── install-windows.md    # Esta guía (Windows)
├── package.json          # Dependencias Node.js
├── requirements.txt      # Dependencias Python (con CUDA)
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
├── transcripciones/      # (se crea al usar) Transcripciones generadas
└── venv/                 # Entorno virtual Python (NO se sube a Git)
```
