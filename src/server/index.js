const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const { randomUUID } = require('crypto');
const { scheduleDeletion, runStartupPurge, TTL } = require('./tempFileManager');

try { require('dotenv').config(); } catch {}

const { transcribirUnSoloArchivo } = require('../js/transcribir');

const API_BASE_PATH = process.env.API_BASE_PATH || '/api';
const app = express();
fs.mkdirSync('uploads', { recursive: true });
runStartupPurge();
setInterval(runStartupPurge, TTL);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MIMES_AUDIO = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
  'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/m4a', 'audio/x-m4a',
  'audio/flac', 'audio/aac', 'video/mp4', 'video/webm',
]);

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, MIMES_AUDIO.has(file.mimetype));
  },
});

const publicDir = path.join(__dirname, '..', '..', 'public');
const indexPath = path.join(publicDir, 'index.html');
const indexHtml = fs
  .readFileSync(indexPath, 'utf8')
  .replace('%API_BASE_PATH%', JSON.stringify(API_BASE_PATH));

// Servir index.html con la variable API_BASE expuesta
app.get(['/', '/index.html'], (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(indexHtml);
});
// Servir archivos estáticos de la carpeta public
app.use(express.static(publicDir));
// Conexiones SSE activas
const conexiones = new Map();
// Archivos generados por ID con persistencia en disco
const archivosGenerados = require('./archivosStore');
archivosGenerados.load();

// Router de la API
const router = express.Router();

// Endpoint SSE para escuchar el progreso de la transcripción
router.get('/progreso/:id', (req, res) => {
  const { id } = req.params;
  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'ID no válido' });
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  conexiones.set(id, res);

  // Mantiene la conexión viva y detecta clientes desconectados silenciosamente
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n');
    else clearInterval(heartbeat);
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    conexiones.delete(id);
  });
});

router.post('/transcribir', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }

    const id = randomUUID();
    const rutasDescarga = {
      txt: `${API_BASE_PATH}/descargar?id=${id}&tipo=txt`,
      md: `${API_BASE_PATH}/descargar?id=${id}&tipo=md`,
      docx: `${API_BASE_PATH}/descargar?id=${id}&tipo=docx`
    };
    res.json({ id, archivos: rutasDescarga });

    const rutaAbsoluta = path.resolve(req.file.path);
    scheduleDeletion(req.file.path);
    console.log('Llamando a transcribirUnSoloArchivo con:', rutaAbsoluta);

    const enviar = (payload) => {
      const cliente = conexiones.get(id);
      if (cliente) {
        cliente.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    const finalizar = () => {
      const cliente = conexiones.get(id);
      if (cliente) {
        cliente.end();
        conexiones.delete(id);
      }
    };

      setImmediate(async () => {
        try {
          const resultado = await transcribirUnSoloArchivo(rutaAbsoluta, (msg) => {
            enviar({ progreso: msg });
          });
          if (!resultado || typeof resultado !== 'object' || !resultado.transcripcion) {
            throw new Error('transcribirUnSoloArchivo no devolvió una ruta de transcripción');
          }
          archivosGenerados.set(id, resultado.rutasRelativas, {
            nombre: req.file.originalname || id,
            fecha: Date.now(),
          });
          const primeraRuta = Object.values(resultado.rutasRelativas).find(Boolean);
          if (primeraRuta) {
            const dir = path.dirname(path.resolve(__dirname, '..', '..', primeraRuta));
            scheduleDeletion(dir, () => archivosGenerados.delete(id));
          }
          const contenido = fs.readFileSync(resultado.transcripcion, 'utf-8');
          enviar({ final: contenido, id });
        } catch (err) {
          console.error('Error en transcripción:', err);
          enviar({ error: err.message });
        } finally {
          finalizar();
        }
      });
  } catch (error) {
    console.error(`Error en ${API_BASE_PATH}/transcribir:`, error);
    return res.status(500).json({ error: error.message });
  }
});

router.get('/descargar', (req, res) => {
  const { id, tipo } = req.query;
  const permitidos = ['txt', 'md', 'docx'];
  if (!id || !UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'ID no válido' });
  }
  if (!permitidos.includes(tipo)) {
    return res.status(400).json({ error: 'Tipo no válido' });
  }
  const archivos = archivosGenerados.get(id);
  if (!archivos) {
    return res.status(404).json({ error: 'ID no válido' });
  }
  const relativa = archivos[tipo];
  if (!relativa) {
    return res.status(404).json({ error: 'Archivo no disponible' });
  }
  const base = path.resolve(__dirname, '..', '..');
  const ruta = path.resolve(base, relativa);
  if (!ruta.startsWith(base)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  if (!fs.existsSync(ruta)) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }
  res.download(ruta, (err) => {
    if (err) console.error('Error al enviar archivo:', err);
  });
});

router.get('/descargar-zip', (req, res) => {
  const { id, tipos } = req.query;
  const permitidos = ['txt', 'md', 'docx'];
  if (!id || !tipos) {
    return res.status(400).json({ error: 'Parámetros faltantes' });
  }
  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'ID no válido' });
  }
  const solicitados = tipos
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (
    !solicitados.length ||
    solicitados.some((t) => !permitidos.includes(t))
  ) {
    return res.status(400).json({ error: 'Tipo no válido' });
  }
  const archivos = archivosGenerados.get(id);
  if (!archivos) {
    return res.status(404).json({ error: 'ID no válido' });
  }
  const base = path.resolve(__dirname, '..', '..');
  const lista = [];
  for (const tipo of solicitados) {
    const relativa = archivos[tipo];
    if (!relativa) {
      return res.status(404).json({ error: 'Archivo no disponible' });
    }
    const ruta = path.resolve(base, relativa);
    if (!ruta.startsWith(base) || !fs.existsSync(ruta)) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    lista.push({ ruta, nombre: path.basename(relativa) });
  }

  const zipName = `transcripcion-${id}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${zipName}"`
  );

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    console.error('Error al crear ZIP:', err);
    res.status(500).end();
  });
  archive.pipe(res);
  lista.forEach((f) => archive.file(f.ruta, { name: f.nombre }));
  archive.finalize();
});

router.get('/historial', (req, res) => {
  res.json(archivosGenerados.list());
});

router.delete('/historial/:id', (req, res) => {
  const { id } = req.params;
  archivosGenerados.delete(id);
  res.status(204).end();
});

app.use(API_BASE_PATH, router);

app.use((err, req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'El archivo es demasiado grande (máximo 500 MB)' });
  }
  console.error('Error no manejado:', err);
  res.status(500).json({ error: err?.message || 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});