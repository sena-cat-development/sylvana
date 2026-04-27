const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

try { require('dotenv').config(); } catch { console.warn('⚠️  No pude cargar el archivo .env'); }

const { buscarArchivosDeAudioProcesado } = require('./partes_audio');
const { combinarTodasLasTranscripciones, verificarSiHablantesEstanRegistrados } = require('./combinar_transcripciones');
const { generarDocumentoWord } = require('./generador_documento');
const { extraerInformacionDelAudio } = require('./metadatos');
const { generarActaDesdeArchivos } = require('./generar_acta');
const puedeUsarGemini = Boolean(process.env.GEMINI_API_KEY);

try {
    if (puedeUsarGemini) {
        console.log('🤖 Gemini ✅ HABILITADO');
        const { GeneradorActas } = require('./generar_acta');
        GeneradorActasConIA = GeneradorActas;
        modoGenerador = 'gemini';
    } else {
        console.log('ℹ️  No hay modelo de IA configurado. Solo se hará transcripción.');
    }
} catch (error) {
    console.warn('⚠️  No se pudo cargar el generador de actas:', error.message);
}


const directorioDelProyecto = path.resolve(__dirname, '../../'),
      carpetaAudioProcesado = path.join(directorioDelProyecto, 'audio_procesado'),
      archivoPlantillaWord = path.join(directorioDelProyecto, 'config/plantilla.docx'),
      archivoHablantes = path.join(directorioDelProyecto, 'config/hablantes.json'),
      scriptPythonTranscribir = path.join(directorioDelProyecto, 'src/python/transcribir.py');

const modoSilencioso = process.argv.includes('--quiet');
if (modoSilencioso) process.argv = process.argv.filter(argumento => argumento !== '--quiet');
const argumentosExtraPython = modoSilencioso ? ['--quiet'] : [];

async function transcribirUnaParte(
  archivoParteInfo,
  scriptPythonTranscribir,
  directorioDelProyecto,
  argumentosExtraPython = [],
  onProgress
) {
  console.log(`🔊 Transcribiendo ${archivoParteInfo.nombreArchivo}...`);

  try {
    await new Promise((resolver, rechazar) => {
      const subproceso = spawn(
        'python',
        ['-u', scriptPythonTranscribir, archivoParteInfo.rutaCompleta, ...argumentosExtraPython],
        {
          cwd: directorioDelProyecto,
          stdio: ['ignore', 'pipe', 'pipe']
        }
      );

      const timeoutId = setTimeout(() => {
        subproceso.kill('SIGKILL');
        rechazar(new Error('Timeout: la transcripción tardó más de 20 minutos'));
      }, 20 * 60 * 1000);

      if (onProgress) onProgress('0');

      subproceso.stdout.on('data', data => {
        const texto = data.toString();
        texto.split(/\r?\n/).forEach(linea => {
          const limpio = linea.trim();
          if (!limpio) return;
          if (/^\d+$/.test(limpio)) {
            onProgress && onProgress(limpio);
          } else {
            process.stdout.write(linea + '\n');
          }
        });
      });

      subproceso.stderr.on('data', data => {
        const texto = data.toString();
        texto.split(/\r?\n/).forEach(linea => {
          const limpio = linea.trim();
          if (!limpio) return;
          if (/^\d+$/.test(limpio)) {
            onProgress && onProgress(limpio);
          } else {
            process.stderr.write(linea + '\n');
          }
        });
      });

      subproceso.on('close', codigo => {
        clearTimeout(timeoutId);
        if (codigo === 0) {
          onProgress && onProgress('100');
          resolver();
        } else {
          rechazar(new Error(`transcribir.py terminó con código ${codigo}`));
        }
      });
      subproceso.on('error', (err) => {
        clearTimeout(timeoutId);
        rechazar(err);
      });
    });

    const nombreBase = path.basename(
      archivoParteInfo.rutaCompleta,
      path.extname(archivoParteInfo.rutaCompleta)
    );
    const archivoTranscripcionEsperado = path.join(
      path.dirname(archivoParteInfo.rutaCompleta),
      `${nombreBase}_transcripcion.txt`
    );

    if (!fs.existsSync(archivoTranscripcionEsperado)) {
      throw new Error(`No encontré la transcripción: ${archivoTranscripcionEsperado}`);
    }

    return {
      parte: archivoParteInfo.numeroParte,
      archivo: archivoTranscripcionEsperado,
      contenido: fs.readFileSync(archivoTranscripcionEsperado, 'utf-8')
    };
  } catch (error) {
    console.error(`❌ Error transcribiendo ${archivoParteInfo.nombreArchivo}:`, error.message);
    throw error;
  }
}

async function transcribirAudioCompletoPorPartes() {
  const archivosParaProcesar = buscarArchivosDeAudioProcesado(carpetaAudioProcesado);
  if (!archivosParaProcesar.length) {
    console.error('❌ No encontré archivos de audio procesados.');
    console.log('💡 Ejecuta primero el preprocesador de audio');
    return;
  }
  console.log(`📋 Encontré ${archivosParaProcesar.length} partes para transcribir:`);
  archivosParaProcesar.forEach(parte => console.log(`   - Parte ${parte.numeroParte}: ${parte.nombreArchivo}`));

  const transcripciones = [];
  for (const parte of archivosParaProcesar) {
    try {
      console.log(`\n📝 PROCESANDO PARTE ${parte.numeroParte}/${archivosParaProcesar.length}`);
      const inicio = Date.now();
      const transcripcion = await transcribirUnaParte(parte, scriptPythonTranscribir, directorioDelProyecto, argumentosExtraPython);
      console.log(`✅ Parte ${transcripcion.parte} completada en ${((Date.now()-inicio)/1000).toFixed(1)}s`);
      transcripciones.push(transcripcion);
    } catch (error) {
      console.error(`❌ Problemas con la parte ${parte.numeroParte}:`, error.message);
    }
  }
  if (!transcripciones.length) return console.error('❌ No pude transcribir ninguna parte.');

  const combinado = combinarTodasLasTranscripciones(transcripciones);
  const nombreBase = path.basename(archivosParaProcesar[0].nombreArchivo, path.extname(archivosParaProcesar[0].nombreArchivo));
  const nombreDelProyecto = nombreBase.replace(/_parte_\d+$/, '');
  const informacion = extraerInformacionDelAudio(nombreDelProyecto, combinado.textoCompleto);

  const carpetaProyecto = path.join(directorioDelProyecto, 'transcripciones', nombreDelProyecto);
  if (!fs.existsSync(carpetaProyecto)) fs.mkdirSync(carpetaProyecto, { recursive: true });
  const archivoTranscripcionCompleta = path.join(carpetaProyecto, `${nombreDelProyecto}.txt`);
  fs.writeFileSync(archivoTranscripcionCompleta, combinado.textoCompleto, 'utf-8');

  let actaIA = null;
  if (puedeUsarGemini) actaIA = await generarActaDesdeArchivos(archivoTranscripcionCompleta, null, informacion);

  console.log(`👥 Hablantes detectados: ${combinado.listaHablantes.sort((primero, segundo) => primero - segundo).map(hablante => `HABLANTE ${hablante}`).join(', ')}`);
  if (verificarSiHablantesEstanRegistrados(combinado.listaHablantes, archivoHablantes)) {
    generarDocumentoWord(combinado.textoCompleto, nombreDelProyecto, {}, archivoPlantillaWord, directorioDelProyecto);
  }

  console.log(`📄 Transcripción: ${archivoTranscripcionCompleta}`);
  if (actaIA) {
    console.log(`🤖 Acta con Gemini: ${actaIA.archivo}`);
    if (actaIA.archivoDocx) console.log(`📄 Acta Word: ${actaIA.archivoDocx}`);
  }
}

async function transcribirUnSoloArchivo(rutaCompletaDelAudio, onProgress) {
  const carpetaDelArchivo = path.dirname(rutaCompletaDelAudio);
  const nombreDelArchivo = path.basename(rutaCompletaDelAudio, path.extname(rutaCompletaDelAudio));
  const archivoTranscripcionEsperado = path.join(carpetaDelArchivo, `${nombreDelArchivo}_transcripcion.txt`);

  try {
    await transcribirUnaParte(
      { nombreArchivo: path.basename(rutaCompletaDelAudio), rutaCompleta: rutaCompletaDelAudio, numeroParte: 1 },
      scriptPythonTranscribir,
      directorioDelProyecto,
      argumentosExtraPython,
      onProgress
    );

    let archivoEncontrado = archivoTranscripcionEsperado;
    if (!fs.existsSync(archivoEncontrado)) {
      const alternativas = [
        path.join(directorioDelProyecto, `${nombreDelArchivo}_transcripcion.txt`),
        path.join(carpetaDelArchivo, `${nombreDelArchivo}_transcripcion.txt`)
      ];
      archivoEncontrado = alternativas.find(ruta => fs.existsSync(ruta));
      if (!archivoEncontrado) throw new Error('No se encontró la transcripción');
    }

    const carpetaDestino = path.join(directorioDelProyecto, 'transcripciones', nombreDelArchivo);
    if (!fs.existsSync(carpetaDestino)) fs.mkdirSync(carpetaDestino, { recursive: true });
    const destinoFinal = path.join(carpetaDestino, `${nombreDelArchivo}_transcripcion.txt`);
    if (archivoEncontrado !== destinoFinal) { fs.renameSync(archivoEncontrado, destinoFinal); archivoEncontrado = destinoFinal; }

    const textoTranscrito = fs.readFileSync(archivoEncontrado, 'utf-8');
    const hablantes = [...new Set([...textoTranscrito.matchAll(/HABLANTE (\w+|\d+)/g)].map(coincidencia => coincidencia[1]))];
    const informacion = extraerInformacionDelAudio(nombreDelArchivo, textoTranscrito);
    let acta = null;
    if (puedeUsarGemini) acta = await generarActaDesdeArchivos(archivoEncontrado, null, informacion);

    if (verificarSiHablantesEstanRegistrados(hablantes, archivoHablantes)) {
      generarDocumentoWord(textoTranscrito, nombreDelArchivo, {}, archivoPlantillaWord, directorioDelProyecto);
    }

    console.log(`📄 Transcripción: ${archivoEncontrado}`);
    if (acta) {
      console.log(`🤖 Acta con Gemini: ${acta.archivo}`);
      if (acta.archivoDocx) console.log(`📄 Acta Word: ${acta.archivoDocx}`);
    }
    const rutasRelativas = {
      txt: path.relative(directorioDelProyecto, archivoEncontrado),
      md: acta && acta.archivo ? path.relative(directorioDelProyecto, acta.archivo) : null,
      docx: acta && acta.archivoDocx ? path.relative(directorioDelProyecto, acta.archivoDocx) : null
    };
    return { transcripcion: archivoEncontrado, acta, informacion, rutasRelativas };
  } catch (error) {
    console.error('❌ Tuve problemas procesando los archivos:', error);
    throw error;
  }
}

if (require.main === module) {
  console.log('🎬 INICIANDO SISTEMA DE TRANSCRIPCIÓN');
  if (process.argv.length > 2) {
    const archivoDeAudio = process.argv[2];
    console.log(`📁 Voy a procesar el archivo: ${archivoDeAudio}`);
    transcribirUnSoloArchivo(archivoDeAudio).catch(error => { console.error('❌ Error:', error.message); process.exit(1); });
  } else {
    transcribirAudioCompletoPorPartes().catch(error => { console.error('❌ Error:', error.message); process.exit(1); });
  }
}

module.exports = { transcribirAudioCompletoPorPartes, transcribirUnSoloArchivo };