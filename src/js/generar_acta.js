// Generador de Actas para Comités SENA
// Este es mi proyecto final de prácticas - Sistema automatizado para generar actas
// Me emociona mucho haber logrado integrar IA para automatizar este proceso
// Autor: Estudiante en práctica - ADSO (Análisis y Desarrollo de Software)

const fs = require("fs");
const path = require("path");
const { fusionarPartes } = require("./fusionar_partes");
const { generarDocumentoWord } = require('./generador_documento');
const { extraerInformacionDelAudio } = require('./metadatos');

// Cargo las variables de entorno 
require('dotenv').config();

// Esta es mi clase principal 
class GeneradorDeActasSENA {
    constructor() {
        this.miClaveAPI = process.env.GEMINI_API_KEY;
        this.modeloIA = null;
        this.reglamento = {};
    }

    async init() {
        await this.configurarConexionConGemini();
        this.cargarReglamento();
        return true;
    }

    cargarReglamento() {
        const ruta = path.join(__dirname, '../../config/reglamento.json');
        try {
            if (fs.existsSync(ruta)) {
                const data = fs.readFileSync(ruta, 'utf-8');
                this.reglamento = JSON.parse(data).articulos || {};
                console.log(`📚 Reglamento del Aprendiz cargado (${Object.keys(this.reglamento).length} artículos)`);
            } else {
                console.log('ℹ️ No encontré config/reglamento.json');
            }
        } catch (e) {
            console.error('⚠️ No pude cargar el reglamento:', e.message);
            this.reglamento = {};
        }
    }

    obtenerTextoReglamento(codigos = []) {
        if (!Array.isArray(codigos) || codigos.length === 0) return '';
        return codigos.map(c => {
            const texto = this.reglamento[c];
            return texto ? `- ${c}: ${texto}` : '';
        }).filter(Boolean).join('\n');
    }

    // Intento adivinar los artículos del reglamento que podrían aplicar
    // comparando palabras clave de la transcripción con cada artículo
    detectarArticulosDesdeTexto(texto = '') {
        if (typeof texto !== 'string' || !texto.trim()) return [];

        const palabras = new Set(
            texto.toLowerCase().split(/\W+/).filter(p => p.length > 4)
        );

        const puntajes = Object.entries(this.reglamento).map(([codigo, cuerpo]) => {
            const palabrasArticulo = new Set(cuerpo.toLowerCase().split(/\W+/));
            let score = 0;
            palabras.forEach(p => {
                if (palabrasArticulo.has(p)) score++;
            });
            return { codigo, score };
        }).filter(p => p.score > 0);

        puntajes.sort((a, b) => b.score - a.score);
        return puntajes.slice(0, 3).map(p => p.codigo);
    }

    async configurarConexionConGemini() {
        try {
            // Importo la librería de Google (me costó entender cómo usarla al principio)
            const { GoogleGenerativeAI } = require("@google/generative-ai");
            this.clienteGemini = new GoogleGenerativeAI(this.miClaveAPI);

            // Uso el modelo que configuré en las variables de entorno
            const modeloQueVoyAUsar = process.env.MODELO_GEMINI || 'gemini-2.5-flash';

            this.modeloIA = this.clienteGemini.getGenerativeModel({
                model: modeloQueVoyAUsar,
                generationConfig: {
                    temperature: parseFloat(process.env.TEMPERATURA) || 0.3,  // No muy creativo, más formal
                    topK: 20,
                    topP: 0.8,
                    maxOutputTokens: parseInt(process.env.MAX_TOKENS) || 8192,
                }
            });
            console.log(`✅ ¡Logré conectar con Gemini! Usando modelo: ${modeloQueVoyAUsar}`);
            return true;
        } catch (error) {
            console.error("❌ Tuve problemas configurando Gemini:", error.message);
            console.log("💡 Necesito instalar: npm install @google/generative-ai");
            console.log("💡 Y configurar mi GEMINI_API_KEY en el archivo .env");
            throw error;
        }
    }

    obtenerPlantillaDelActa() {
        // Esta plantilla la hice basándome en las actas reales que vi en el SENA
        return `Eres un asistente experto en redactar actas formales del Comité de Evaluación y Seguimiento del SENA.

Debes generar un acta **siguiendo exactamente esta estructura y formato**.


**CIUDAD Y FECHA:** [Extraer o inferir. Ejemplo: "Bogotá D.C., 14 de agosto de 2024"]
**HORA INICIO:** [Extraer o inferir en formato HH:MM (24h). Ejemplo: "08:00"]
**HORA FIN:** [Extraer o inferir en formato HH:MM (24h). Ejemplo: "10:30"]
**LUGAR:** [Extraer o inferir. Ejemplo: "Sala 301" o "Google Meet"]


## OBJETIVO(S) DE LA REUNIÓN:
Analizar el caso del aprendiz [Nombre del aprendiz; ej. "Juan Pérez"] DEL PROGRAMA [Nombre del programa; ej. "Técnico en Asistencia Administrativa"] FICHA: [Número de ficha; ej. "1234567"]


## PARTICIPANTES
- **COORDINACIÓN ACADÉMICA:** [Nombre; ej. "María Pérez"]
- **BIENESTAR DEL APRENDIZ:** [Cargo y Nombre; ej. "DR. Luis Gómez"]
- **INSTRUCTORES:** [Lista de instructores; ej. "Ana Díaz"]
- **APRENDIZ CITADO:** [Nombre del aprendiz; ej. "Juan López"]
- **REPRESENTANTE DE CENTRO:** [Nombre; ej. "Pedro Martínez"]
- **VOCERO:** [Nombre; ej. "Laura Sánchez"]

### 3. HECHOS QUE SERÁN OBJETO DE ESTUDIO EN EL COMITÉ
[Enumera cada hecho con números consecutivos y pon cada hecho en un párrafo separado dandole un renglon de separación entre parrafos. Extrae con claridad los hechos reportados por los instructores, mencionando fechas, fallas y evidencias. Por ejemplo: "1) El día 13 de diciembre del 2024 el aprendiz falla la prueba de conocimiento por segunda vez, teniendo en cuenta que previamente se había asignado una actividad complementaria. etc."].

Se indica la preocupación acerca del tema, el cual radica en que se evidencia incumplimiento del REGLAMENTO DEL APRENDIZ: en el [Cita el artículo exacto del reglamento del aprendiz que describa el incumplimiento Por ejemplo: CAPITULO III DEBERES DEL APRENDIZ SENA; Artículo 22º Deberes del aprendiz, en su numeral cita: Numeral 6 Cumplir con todas las actividades de aprendizaje propias de su proceso formativo, presentando las evidencias según la planeación pedagógica, guías de aprendizaje y cronograma, en los plazos o en la oportunidad que estas deban presentarse o reportarse, a través de los medios dispuestos para ello Numeral 7. Realizar una dedicación efectiva del tiempo, priorizando las actividades de aprendizaje y manteniendo un compromiso constante para alcanzar los resultados de aprendizaje propuestos en el programa de formación.]

Hechos Instructor(a) [Nombre del instructor]:

El aprendiz [Nombre del aprendiz], (agregar numero de CC o TI) se reporta a comité de tipo [Tipo de comité, por ejemplo: "academico", "disciplinario", etc.] 
Instructor(a): [Cargo y nombre del instructor]: [extrae los hechos reportados por el instructor, incluyendo fechas, fallas y evidencias. Por ejemplo: "El aprendiz no participó en las actividades de socialización, no subió evidencias al drive, no participó en exposiciones ni en actividades de bienestar del aprendiz."]

Se indica la preocupación acerca del tema, el cual radica en que se evidencia incumplimiento del REGLAMENTO DEL APRENDIZ: en el [Cita el artículo exacto del reglamento del aprendiz que describa el incumplimiento Por ejemplo: "CAPITULO III DEBERES DEL APRENDIZ SENA; Articulo No.9 Deberes del aprendiz, en su numeral 4, el cual cita: Participar en las actividades complementarias o de profundización, relacionadas con el programa de formación, con el fin de gestionar su proceso de aprendizaje."]

Por lo anterior y respetando el debido proceso, se cita al aprendiz [Nombre del aprendiz] del programa [extraer programa y numero de la ficha. Por ejemplo: "TECNICO DE ASISTECIA ADMINISTRATIVA FICHA 3065626"]. para la presentación de sus descargos ante el Comité de Evaluación y Seguimiento, respetando el derecho que le asiste a controvertir las pruebas allegadas o que se alleguen en su contra y a aportar y/o solicitar la práctica de las pruebas que considere pertinentes.

### 5. DESARROLLO DEL COMITÉ / ANALISIS DEL CASO, DESCARGOS DEL APRENDIZ Y PRÁCTICA DE PRUEBAS A QUE HAYA LUGAR
[Intervenciones de los participantes. El formato debe ser: **Interviene [Cargo y nombre]:** debe ser en tercera persona y lo que dicen colocalo en el renglon siguiente
ejemplo
"INTERVIENE VOCERO LUIS ALFREDO LLANOS: 
Ingeniero, una pregunta, ¿y no va a ser una afectaría eso el traslado?"

Arregla los párrafos de manera que los corrijas y que tengan coherencia porque estas son transcripciones que hice de un audio de una reunión pero como lo grave en celular hay cosas que no se escucharon bien y al transcribirlas no se entienden recuerda que sea acorde a lo que están hablando.

Recuerda siempre comenzar por la intervencion del ${process.env.COORDINADOR_ACADEMICO || 'coordinador académico'}, Extrae y resume lo más relevante dicho por los participantes, extrae los puntos tratados análisis del caso, descargos del aprendiz, pruebas realizadas y cualquier otro detalle relevante.]

### 6. CONCLUSIONES
[Resume lo mas que se pueda del tipo de falta, gravedad, medidas, planes de mejoramiento.]


## COMPROMISOS Y SEGUIMIENTO

| Actividad/Decisión | Fecha Límite | Responsable |
|-------------------|--------------|-------------|
| [Compromiso 1]     | [Fecha]      | [Nombre]    |
| [Compromiso 2]     | [Fecha]      | [Nombre]    |


## INSTRUCCIONES ADICIONALES:
- primero revisa la transcripción para sacar los nombres a todos los participantes.
- segundo revisa la transcripción para sacar los hechos
- tercero revisa la transcripción para sacar las Intervenciones
- Importantisimo Usa **tercera persona** y lenguaje formal.
- **No inventes contenido** si no está en la transcripción.
- la que da el saludo de bienvenida es la apoyo a novedades Susana Mayorga no lo olvides.
- El encargado de Bienestar del Aprendiz es ${process.env.BIENESTAR_APRENDIZ || 'el bienestar del aprendiz'}.
- Si falta algún dato, realiza la mejor inferencia posible o deja el campo vacío.
- Respeta **el orden y títulos exactos** del formato.
- Usa Markdown correctamente (títulos con #, negritas con **).
- No agregues la intevenciones pequeñas por ejemplo "**INTERVIENE APRENDIZ JUAN MARTÍN DÍAZ VEGA:** Sí, con la Dra. Erika." etc. 
- si en las intervenciones no reconoces el nombre de un participante, elije de la sección de participantes y utiliza el nombre que creas que corresponde teniendo en cuenta lo que esta dicendo el texto.
- resume lo mas que se pueda las conclusiones, no copies textualmente lo que dicen los participantes.

Ahora redacta el acta en formato Markdown con base en la siguiente transcripción.`;
    }

    // Función para crear las carpetas donde guardo mis actas
    crearCarpetaParaElProyecto(nombreDelProyecto, esVersionFinal = false) {
        const dirBase = process.env.DIRECTORIO_ACTAS || 'actas_gemini';
        const carpetaPrincipal = esVersionFinal ? `${dirBase}/finales` : `${dirBase}/versiones`;
        const nombreLimpio = nombreDelProyecto.replace(/_transcripcion.*$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
        const rutaCarpetaCompleta = path.join(carpetaPrincipal, nombreLimpio);

        if (!fs.existsSync(rutaCarpetaCompleta)) {
            fs.mkdirSync(rutaCarpetaCompleta, { recursive: true });
            console.log(`📁 Creé la carpeta: ${rutaCarpetaCompleta}`);
        }

        return rutaCarpetaCompleta;
    }

    // Extraigo la tabla de compromisos y otros metadatos del acta en Markdown
    extraerMetadatosDelActa(textoActa) {
        const obtener = (regex) => {
            const m = textoActa.match(regex);
            return m ? m[1].trim() : null;
        };

        const limpiar = (v) => v ? v.replace(/\*+/g, '').trim() : v;

        const fecha = limpiar(obtener(/CIUDAD Y FECHA:\s*([^\n]+)/i));
        const horaInicio = limpiar(obtener(/HORA INICIO:\s*([^\n]+)/i));
        const horaFin = limpiar(obtener(/HORA FIN:\s*([^\n]+)/i));

        let participantes = [];
        const seccionPartes = textoActa.split(/##\s*PARTICIPANTES/i)[1];
        if (seccionPartes) {
            for (const linea of seccionPartes.split(/\r?\n/)) {
                const recorte = linea.trim();
                if (recorte.startsWith('##')) break;
                if (recorte.startsWith('-')) {
                    participantes.push(recorte.replace(/^-+\s*/, '').replace(/\*+/g, '').trim());
                }
            }
        }

        const obtenerSeccion = (regex) => {
            const partes = textoActa.split(regex);
            if (partes.length < 2) return null;
            const despues = partes.slice(1).join('\n');
            return partes[1]
                .split(/\n##\s+/)[0]
                .split(/\n###\s*\d+\./)[0]
                .trim();
        };

        const hechos = obtenerSeccion(/###\s*3\.?[^\n]*HECHOS[^\n]*/i);
        const desarrolloComite = obtenerSeccion(/###\s*5\.?[^\n]*DESARROLLO[^\n]*/i);
        const conclusiones = obtenerSeccion(/###\s*6\.?[^\n]*CONCLUSIONES[^\n]*/i);

        const objetivosMatch = textoActa.split(/##\s*OBJETIVO\(S\)? DE LA REUNIÓN[^\n]*\n/i);
        let objetivos = null;
        if (objetivosMatch.length > 1) {
            objetivos = objetivosMatch[1].split(/\n##\s*/)[0].trim();
        }

        const compromisos = this.extraerCompromisos(textoActa);
        return { fecha, horaInicio, horaFin, participantes, hechos, desarrolloComite, conclusiones, compromisos, objetivos };
    }

    // Parsea la sección de compromisos y seguimiento para obtener cada fila de la tabla
    extraerCompromisos(texto = '') {
        const seccion = texto.split(/##\s*COMPROMISOS Y SEGUIMIENTO/i)[1];
        if (!seccion) return [];
        const filas = [];
        for (const linea of seccion.split(/\r?\n/)) {
            const l = linea.trim();
            if (l.startsWith('##')) break;
            if (!l.startsWith('|')) continue;
            const partes = l.split('|').map(p => p.trim());
            if (partes.length < 4) continue;
            if (/^-{3,}$/.test(partes[1])) continue; // salto separadores
            filas.push({
                actividad: partes[1] || '',
                fecha: partes[2] || '',
                responsable: partes[3] || '',
                firma: ''   // evita "undefined" en la columna FIRMA/PARTICIPACIÓN
            });
        }
        return filas;
    }

    async generarMiActa(textoTranscripcion, informacionExtra = {}) {
        if (!this.modeloIA) {
            console.error("❌ No tengo Gemini configurado. Necesito verificar mi API key.");
            return null;
        }

        console.log("🤖 Generando acta con mi sistema de IA...");

        const textoReducido = textoTranscripcion.length > 4500
            ? textoTranscripcion.slice(0, 4500) + "\n[...transcripción truncada por longitud...]"
            : textoTranscripcion;

        let articulosSeleccionados = informacionExtra.articulosReglamento;
        if (!Array.isArray(articulosSeleccionados) || articulosSeleccionados.length === 0) {
            articulosSeleccionados = this.detectarArticulosDesdeTexto(textoTranscripcion);
        }
        const articulos = this.obtenerTextoReglamento(articulosSeleccionados);
        const promptCompleto = `${this.obtenerPlantillaDelActa()}

TRANSCRIPCIÓN DEL COMITÉ QUE NECESITO PROCESAR:
${textoReducido}

INFORMACIÓN ADICIONAL QUE DETECTÉ:
- Institución: ${process.env.INSTITUCION || 'SENA'}${process.env.CENTRO ? `\n- Centro: ${process.env.CENTRO}` : ''}${process.env.REGION ? `\n- Región: ${process.env.REGION}` : ''}
- Programa Académico: ${informacionExtra.programaAcademico || 'Técnico en Asistencia Administrativa'}
- Número de Ficha: ${informacionExtra.numeroFicha || 'Por determinar'}
- Fecha del Comité: ${informacionExtra.fechaDeHoy || new Date().toLocaleDateString('es-CO')}
- Aprendiz Principal: ${informacionExtra.nombreAprendiz || 'Extraer de la transcripción'}
${articulos ? `\nNORMATIVA APLICABLE:\n${articulos}\n` : ''}

Por favor ayúdame a generar el acta formal completa siguiendo exactamente el formato que necesito.`;

        try {
            const resultadoDeGemini = await this.modeloIA.generateContent(promptCompleto);
            const respuestaObtenida = await resultadoDeGemini.response;

            if (!respuestaObtenida) {
                throw new Error("Gemini no me respondió nada");
            }

            const actaGenerada = respuestaObtenida.text();

            // Creo la carpeta específica para este proyecto
            const nombreProyecto = informacionExtra.nombreDelProyecto || 'acta_comite';
            const carpetaDelProyecto = this.crearCarpetaParaElProyecto(nombreProyecto, informacionExtra.esVersionFinal);

            // Genero el nombre del archivo
            const fechaHoy = new Date().toISOString().split('T')[0];
            const nombreDelArchivo = informacionExtra.esVersionFinal ?
                `${nombreProyecto}_final.md` :
                `${nombreProyecto}_${fechaHoy}.md`;

            const rutaCompletaDelActa = path.join(carpetaDelProyecto, nombreDelArchivo);

            fs.writeFileSync(rutaCompletaDelActa, actaGenerada, 'utf-8');

            console.log(`✅ ¡Logré generar el acta! Se guardó en: ${rutaCompletaDelActa}`);
            console.log(`📄 Tamaño del acta: ${actaGenerada.length} caracteres`);

            const metadatos = this.extraerMetadatosDelActa(actaGenerada);

            return {
                textoDelActa: actaGenerada,
                archivo: rutaCompletaDelActa,
                carpetaDelProyecto: carpetaDelProyecto,
                ...metadatos
            };

        } catch (error) {
            console.error("❌ Tuve un problema generando el acta:", error.message);

            // Diagnostico qué pudo haber pasado (esto me ayuda a aprender)
            if (error.message.includes('API_KEY')) {
                console.log("💡 Parece que hay un problema con mi API Key de Gemini.");
            } else if (error.message.includes('quota')) {
                console.log("💡 Llegué al límite de uso de la API. Intentaré más tarde.");
            } else if (error.message.includes('model')) {
                console.log("💡 Hay un problema con el modelo que estoy usando.");
            }

            return null;
        }
    }

    async generarActaEnDosPartes(textoTranscripcion, informacionExtra = {}) {
        if (!this.modeloIA) {
            console.error("❌ No tengo Gemini configurado. Necesito verificar mi API key.");
            return null;
        }

        console.log("🤖 Generando acta en dos llamadas a Gemini...");

        let articulosSeleccionados = informacionExtra.articulosReglamento;
        if (!Array.isArray(articulosSeleccionados) || articulosSeleccionados.length === 0) {
            articulosSeleccionados = this.detectarArticulosDesdeTexto(textoTranscripcion);
        }
        const articulos = this.obtenerTextoReglamento(articulosSeleccionados);
        const promptBase = `${this.obtenerPlantillaDelActa()}

TRANSCRIPCIÓN DEL COMITÉ QUE NECESITO PROCESAR:
${textoTranscripcion}

INFORMACIÓN ADICIONAL QUE DETECTÉ:
- Institución: ${process.env.INSTITUCION || 'SENA'}${process.env.CENTRO ? `\n- Centro: ${process.env.CENTRO}` : ''}${process.env.REGION ? `\n- Región: ${process.env.REGION}` : ''}
- Programa Académico: ${informacionExtra.programaAcademico || 'Técnico en Asistencia Administrativa'}
- Número de Ficha: ${informacionExtra.numeroFicha || 'Por determinar'}
- Fecha del Comité: ${informacionExtra.fechaDeHoy || new Date().toLocaleDateString('es-CO')}
- Aprendiz Principal: ${informacionExtra.nombreAprendiz || 'Extraer de la transcripción'}
${articulos ? `\nNORMATIVA APLICABLE:\n${articulos}\n` : ''}

Por favor escribe la primera mitad del acta. Finaliza con la etiqueta <<CONTINUAR>> si falta texto.`;

        try {
            const chat = this.modeloIA.startChat();
            const primeraParte = await chat.sendMessage(promptBase);
            const textoPrimera = (await primeraParte.response).text();

            const segundaParte = await chat.sendMessage("Continúa la redacción del acta justo donde quedó la etiqueta <<CONTINUAR>> y termina el documento.");
            const textoSegunda = (await segundaParte.response).text();
            const actaFinal = fusionarPartes(textoPrimera, textoSegunda);

            const nombreProyecto = informacionExtra.nombreDelProyecto || 'acta_comite';
            const carpetaDelProyecto = this.crearCarpetaParaElProyecto(nombreProyecto, informacionExtra.esVersionFinal);
            const fechaHoy = new Date().toISOString().split('T')[0];
            const nombreDelArchivo = informacionExtra.esVersionFinal ?
                `${nombreProyecto}_final.md` :
                `${nombreProyecto}_${fechaHoy}.md`;

            const rutaCompletaDelActa = path.join(carpetaDelProyecto, nombreDelArchivo);
            fs.writeFileSync(rutaCompletaDelActa, actaFinal, 'utf-8');

            console.log(`✅ ¡Acta generada en dos partes! Se guardó en: ${rutaCompletaDelActa}`);
            console.log(`📄 Tamaño del acta final: ${actaFinal.length} caracteres`);

            const metadatos = this.extraerMetadatosDelActa(actaFinal);

            return {
                textoDelActa: actaFinal,
                archivo: rutaCompletaDelActa,
                carpetaDelProyecto: carpetaDelProyecto,
                ...metadatos
            };
        } catch (error) {
            console.error("❌ Ocurrió un problema en la generación por partes:", error.message);
            return null;
        }
    }

    async generarVariasVersionesDelActa(textoTranscripcion, informacionExtra = {}, numeroDeVersiones = 2) {
        console.log(`🔄 Voy a generar ${numeroDeVersiones} versiones diferentes del acta para elegir la mejor...`);

        const versionesGeneradas = [];

        for (let i = 1; i <= numeroDeVersiones; i++) {
            console.log(`📝 Generando versión ${i} de ${numeroDeVersiones}...`);

            const informacionParaEstaVersion = {
                ...informacionExtra,
                nombreDelProyecto: `${informacionExtra.nombreDelProyecto || 'acta'}_version_${i}`,
                esVersionFinal: false
            };

            const resultadoDeEstaVersion = await this.generarMiActa(textoTranscripcion, informacionParaEstaVersion);

            if (resultadoDeEstaVersion) {
                versionesGeneradas.push({
                    numeroVersion: i,
                    archivoGenerado: resultadoDeEstaVersion.archivo,
                    textoCompleto: resultadoDeEstaVersion.textoDelActa
                });
            }

            // Pauso un poco entre versiones para no saturar la API
            if (i < numeroDeVersiones) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        console.log(`✅ Logré generar ${versionesGeneradas.length} versiones del acta`);
        return versionesGeneradas;
    }

    analizarCalidadDeLasVersiones(listaDeVersiones) {
        console.log("🔍 Analizando qué versión quedó mejor...");

        const analisisDeVersiones = listaDeVersiones.map(version => {
            const texto = version.textoCompleto;

            return {
                numeroVersion: version.numeroVersion,
                archivoGenerado: version.archivoGenerado,
                estadisticas: {
                    longitud: texto.length,
                    numeroSecciones: (texto.match(/#{1,3}/g) || []).length,
                    participantesEncontrados: (texto.match(/\*\*[A-Z\s]+:\*\*/g) || []).length,
                    fechasEncontradas: (texto.match(/\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2} de \w+ de \d{4}/g) || []).length,
                    tieneConclusiones: texto.includes('CONCLUSIONES') ? 1 : 0,
                    tieneCompromisos: texto.includes('COMPROMISOS') ? 1 : 0
                }
            };
        });

        if (process.env.MODO_DETALLADO?.toLowerCase() !== 'false') {
            console.log("📊 Estadísticas de cada versión:");
            analisisDeVersiones.forEach(analisis => {
                console.log(`   Versión ${analisis.numeroVersion}:`);
                console.log(`     - Extensión: ${analisis.estadisticas.longitud} caracteres`);
                console.log(`     - Secciones: ${analisis.estadisticas.numeroSecciones}`);
                console.log(`     - Participantes: ${analisis.estadisticas.participantesEncontrados}`);
                console.log(`     - Fechas: ${analisis.estadisticas.fechasEncontradas}`);
                console.log(`     - Está completa: ${analisis.estadisticas.tieneConclusiones && analisis.estadisticas.tieneCompromisos ? '✅' : '❌'}`);
            });
        }

        // Elijo la mejor versión basándome en completitud
        const mejorVersion = analisisDeVersiones.reduce((mejor, actual) => {
            const puntajeMejor = mejor.estadisticas.numeroSecciones + mejor.estadisticas.participantesEncontrados +
                mejor.estadisticas.tieneConclusiones + mejor.estadisticas.tieneCompromisos;
            const puntajeActual = actual.estadisticas.numeroSecciones + actual.estadisticas.participantesEncontrados +
                actual.estadisticas.tieneConclusiones + actual.estadisticas.tieneCompromisos;

            return puntajeActual > puntajeMejor ? actual : mejor;
        });

        console.log(`🏆 La mejor versión es: Versión ${mejorVersion.numeroVersion} (${path.basename(mejorVersion.archivoGenerado)})`);

        return mejorVersion;
    }

    async crearVersionFinalDelActa(mejorVersion, informacionExtra) {
        try {
            const nombreProyecto = informacionExtra.nombreDelProyecto || 'acta';
            const carpetaFinales = this.crearCarpetaParaElProyecto(nombreProyecto, true);

            const nombreArchivoFinal = `${nombreProyecto}_final.md`;
            const rutaArchivoFinal = path.join(carpetaFinales, nombreArchivoFinal);

            fs.copyFileSync(mejorVersion.archivoGenerado, rutaArchivoFinal);

            console.log(`🎯 ¡Creé la versión final! Se guardó en: ${rutaArchivoFinal}`);

            return rutaArchivoFinal;
        } catch (error) {
            console.log(`❌ Tuve problemas creando la versión final: ${error.message}`);
            return null;
        }
    }
}

// Esta es mi función principal que uso desde otros archivos
async function procesarTranscripcionParaGenerarActa(archivoDeTranscripcion, informacionExtra = {}) {
    try {
        // Verifico que el archivo existe
        if (!fs.existsSync(archivoDeTranscripcion)) {
            console.error(`❌ No encontré el archivo: ${archivoDeTranscripcion}`);
            return false;
        }

        // Leo la transcripción
        const textoTranscrito = fs.readFileSync(archivoDeTranscripcion, 'utf-8');

        if (textoTranscrito.length < 100) {
            console.error("❌ La transcripción está muy corta para generar un acta decente");
            return false;
        }

        console.log(`📝 Procesando: ${path.basename(archivoDeTranscripcion)}`);
        console.log(`📏 Tamaño de la transcripción: ${textoTranscrito.length} caracteres`);

        // Creo mi generador de actas
        const miGenerador = new GeneradorDeActasSENA();

        // Inicializo la conexión con Gemini
        await miGenerador.init();

        // Extraigo información básica del nombre del archivo
        const nombreBase = path.basename(archivoDeTranscripcion, path.extname(archivoDeTranscripcion));
        const informacionCompleta = {
            nombreDelProyecto: nombreBase.replace('_transcripcion', ''),
            fechaDeHoy: new Date().toLocaleDateString('es-CO'),
            ...informacionExtra
        };

        // Detecto información automáticamente de la transcripción
        const programaDetectado = textoTranscrito.match(/programa\s+([^.]+)/i);
        const fichaDetectada = textoTranscrito.match(/ficha\s*:?\s*(\d+)/i);
        const aprendizDetectado = textoTranscrito.match(/aprendiz\s+([A-Z\s]+)/i);

        if (programaDetectado) informacionCompleta.programaAcademico = programaDetectado[1].trim();
        if (fichaDetectada) informacionCompleta.numeroFicha = fichaDetectada[1];
        if (aprendizDetectado) informacionCompleta.nombreAprendiz = aprendizDetectado[1].trim();

        const numVersiones = parseInt(process.env.NUMERO_VERSIONES, 10) || 2;
        const guardarVersiones = process.env.GUARDAR_VERSIONES?.toLowerCase() !== 'false';

        let archivoFinal, versionesGeneradas, mejorVersion;

        if (guardarVersiones && numVersiones > 1) {
            versionesGeneradas = await miGenerador.generarVariasVersionesDelActa(
                textoTranscrito,
                informacionCompleta,
                numVersiones
            );
            if (!versionesGeneradas.length) {
                console.error("❌ No logré generar ninguna versión del acta");
                return false;
            }
            mejorVersion = miGenerador.analizarCalidadDeLasVersiones(versionesGeneradas);
            archivoFinal = await miGenerador.crearVersionFinalDelActa(mejorVersion, informacionCompleta);
        } else {
            // Versión única — más rápido y consume menos cuota de API
            const resultado = await miGenerador.generarMiActa(textoTranscrito, {
                ...informacionCompleta,
                esVersionFinal: true,
            });
            if (!resultado) {
                console.error("❌ No logré generar el acta");
                return false;
            }
            archivoFinal = resultado.archivo;
            versionesGeneradas = [];
            mejorVersion = null;
        }

        console.log(`\n🎉 ¡PROCESO DE GENERACIÓN DE ACTAS COMPLETADO!`);
        console.log(`📄 Acta final: ${archivoFinal}`);
        console.log(`📁 Versiones generadas: ${versionesGeneradas.length}`);

        return { archivoFinal, versiones: versionesGeneradas, mejorVersion };

    } catch (error) {
        console.error("❌ Tuve un error en mi procesamiento:", error.message);
        return false;
    }
}

// Función para buscar transcripciones automáticamente en mi directorio
async function buscarYProcesarTodasLasTranscripciones() {
    console.log("🔗 Buscando transcripciones que pueda procesar...");

    // Busco archivos de transcripción en mi directorio
    const archivosDeTranscripcion = fs.readdirSync('.')
        .filter(archivo => archivo.includes('_transcripcion.txt'))
        .sort();

    if (archivosDeTranscripcion.length === 0) {
        console.log("ℹ️  No encontré transcripciones. Primero necesito ejecutar el transcriptor.");
        return;
    }

    console.log(`📋 Encontré ${archivosDeTranscripcion.length} transcripciones:`);
    archivosDeTranscripcion.forEach((archivo, i) => {
        console.log(`   ${i + 1}. ${archivo}`);
    });

    // Proceso cada transcripción
    for (const archivo of archivosDeTranscripcion) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🎯 PROCESANDO: ${archivo}`);
        console.log(`${'='.repeat(60)}`);

        const resultado = await procesarTranscripcionParaGenerarActa(archivo);

        if (resultado) {
            console.log(`✅ ${archivo} → ${path.basename(resultado.archivoFinal)}`);
        } else {
            console.log(`❌ Tuve problemas procesando ${archivo}`);
        }

        // Pauso entre archivos para no saturar la API
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
}

async function generarActaDesdeArchivos(parte1, parte2 = null, info = {}) {
    const textos = [];
    if (parte1) textos.push(fs.readFileSync(parte1, 'utf8'));
    if (parte2) textos.push(fs.readFileSync(parte2, 'utf8'));
    const textoCompleto = textos.join('\n\n');

    const nombreBase = info.nombreDelProyecto ||
        (parte1 ? path.basename(parte1).replace('_transcripcion', '').replace(path.extname(parte1), '') : 'acta');
    const infoDetectada = extraerInformacionDelAudio(nombreBase, textoCompleto);
    const infoFinal = { ...infoDetectada, ...info, nombreDelProyecto: nombreBase };

    const generador = new GeneradorDeActasSENA();
    await generador.init();
    const resultado = await generador.generarActaEnDosPartes(textoCompleto, infoFinal);

    if (resultado) {
        const directorioDelProyecto = path.resolve(__dirname, '../../');
        const archivoPlantillaWord = path.join(directorioDelProyecto, 'config/plantilla.docx');

        generarDocumentoWord(resultado.textoDelActa, infoFinal.nombreDelProyecto, {
            fecha: resultado.fecha,
            horaInicio: resultado.horaInicio,
            horaFin: resultado.horaFin,
            participantes: resultado.participantes,
            objetivos: resultado.objetivos,
            hechos: resultado.hechos,
            desarrolloComite: resultado.desarrolloComite,
            conclusiones: resultado.conclusiones,
            compromisos: resultado.compromisos
        }, archivoPlantillaWord, directorioDelProyecto);

        const docxName = `${infoFinal.nombreDelProyecto}_acta_completa.docx`;
        const docxOrigen = path.join(directorioDelProyecto, docxName);
        const destino = path.join(path.dirname(resultado.archivo), docxName);
        try {
            fs.renameSync(docxOrigen, destino);
            resultado.archivoDocx = destino;
        } catch (err) {
            console.error(`No pude mover el archivo Word: ${err.message}`);
        }
    }

    return resultado;
}

// Exporto mis funciones para que otros archivos las puedan usar
module.exports = {
    GeneradorActas: GeneradorDeActasSENA,  // Mantengo el nombre original para compatibilidad
    procesarTranscripcionConGemini: procesarTranscripcionParaGenerarActa,  // Alias para compatibilidad
    integrarConTranscriptor: buscarYProcesarTodasLasTranscripciones,
    generarActaDesdeArchivos
};

// Esta parte se ejecuta cuando llamo al archivo directamente
if (require.main === module) {
    console.log("🎓 GENERADOR DE ACTAS SENA");

    (async () => {
        const args = process.argv.slice(2);
        const archivos = [];
        const overrides = {};

        for (const arg of args) {
            if (arg.startsWith('--')) {
                const [flag, valor] = arg.split('=');
                if (!valor) continue;
                switch (flag) {
                    case '--fecha':
                        overrides.fechaDeHoy = valor;
                        break;
                    case '--programa':
                        overrides.programaAcademico = valor;
                        break;
                    case '--ficha':
                        overrides.numeroFicha = valor;
                        break;
                    case '--aprendiz':
                        overrides.nombreAprendiz = valor;
                        break;
                }
            } else {
                archivos.push(arg);
            }
        }

        if (archivos.length > 0) {
            const [parte1, parte2] = archivos;
            const nombreProyecto = path.basename(parte1).replace('_transcripcion', '').replace(path.extname(parte1), '');
            const info = { nombreDelProyecto: nombreProyecto, ...overrides };

            const resultado = await generarActaDesdeArchivos(parte1, parte2, info);
            if (resultado) {
                console.log(`Acta generada en: ${resultado.archivo}`);
                if (resultado.archivoDocx) {
                    console.log(`Documento Word guardado en: ${resultado.archivoDocx}`);
                }
            } else {
                console.error('No se generó el acta.');
            }
        } else {
            console.log("🔄 Modo automático: voy a procesar todas las transcripciones");
            buscarYProcesarTodasLasTranscripciones();
        }
    })();
}