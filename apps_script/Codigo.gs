/**
 * La voz de la Junta — backend en Google Apps Script
 *
 * Cada asistente responde DOS preguntas en un solo formulario (captura/index.html):
 *   1. Visión: ¿qué visión tiene para Cartagena y Bolívar?
 *   2. Compromiso: ¿cuál es su compromiso concreto?
 * Cada respuesta puede ser nota de voz o texto.
 *
 * Flujo:
 *  1. El formulario envía las respuestas → los audios quedan en Drive y se crea UNA fila en la hoja "Voces".
 *  2. Cada minuto, procesarPendientes() le pide a Gemini, para la visión y para el compromiso por separado:
 *     la transcripción literal, la palanca del sistema (y una secundaria), el sector, un resumen y la confianza.
 *  3. El equipo puede corregir la palanca en las columnas "*_palanca_validada"; esa manda sobre la de la IA.
 *
 * Proyecto independiente de Apps Script: la hoja se abre por su ID (SHEET_ID).
 * Montaje: ver LEEME_montaje.md.
 */

// ---------- Configuración ----------
const HOJA = 'Voces';
// ID de la hoja de cálculo (está en su dirección: docs.google.com/spreadsheets/d/ESTE_ID/edit)
const SHEET_ID = 'PEGUE_AQUI_EL_ID_DE_SU_HOJA';
// Modelos a intentar, en orden. Ejecute verificarGemini() antes del evento para confirmar cuál responde.
const MODELOS = ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
const POR_LOTE = 8;          // filas que procesa cada minuto
const MAX_INTENTOS = 6;

const PARTES = ['vision', 'compromiso'];
const CAMPOS_PARTE = ['escrita', 'audio_url', 'audio_id', 'transcripcion', 'palanca', 'palanca_2', 'sector', 'resumen', 'confianza', 'palanca_validada'];
const COLUMNAS = ['id', 'recibido', 'nombre', 'organizacion', 'rol']
  .concat(...PARTES.map(p => CAMPOS_PARTE.map(c => p + '_' + c)))
  .concat(['estado_ia', 'intentos', 'ocultar', 'estado', 'notas_equipo', 'consentimiento']);

const PALANCAS = {
  conectividad: 'Conectividad que mueve la producción y acerca a la gente (vías, puertos, aeropuerto, tren, accesos, conectividad digital)',
  energia: 'Energía confiable para la casa y la industria (tarifas, pérdidas, calidad del servicio, renovables, gas, conexión a la red)',
  agua: 'Agua que llega a los hogares y riega el campo (acueducto, saneamiento, distritos de riego, Canal del Dique)',
  clima: 'Territorio que se anticipa al clima (adaptación, riesgo, erosión costera, inundaciones, gestión ambiental)',
  reglas: 'Reglas claras para abrir, operar y formalizarse (formalización, trámites, regulación, ventanilla única, normas sin reglamentar)',
  credito: 'Crédito que llega y produce (financiamiento, garantías, fondos, acceso de la mipyme)',
  formacion: 'Formación pertinente para el trabajo (educación técnica, bilingüismo, talento para puerto, turismo, industria)',
  brechas: 'Cierre de brechas que activa el potencial productivo (pobreza, empleo formal, inclusión, barrios, ruralidad)',
  instituciones: 'Instituciones regionales con respaldo de la Nación (capacidad de ejecución, coordinación Distrito-Gobernación-Nación, gobernanza)'
};
const SECTORES = {
  maritimo: 'Marítimo y astillero', energia: 'Energía', turismo: 'Turismo', industria: 'Industria', agro: 'Agro',
  comext: 'Comercio exterior y logística', desemp: 'Desarrollo empresarial', hogares: 'Hogares y social'
};
const PREGUNTAS = {
  vision: 'Visión: ¿qué visión tiene para Cartagena y Bolívar?',
  compromiso: 'Compromiso: ¿cuál es su compromiso concreto? (algo que su organización hará o aportará)'
};

// ---------- Montaje ----------
function configurar() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  if (ss.getName() !== 'La voz de la Junta') ss.rename('La voz de la Junta');
  let sh = ss.getSheetByName(HOJA);
  if (!sh) { sh = ss.insertSheet(HOJA); const h1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1'); if (h1) ss.deleteSheet(h1); }
  sh.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CARPETA_ID')) {
    props.setProperty('CARPETA_ID', DriveApp.createFolder('La voz de la Junta - audios').getId());
  }
  // Listas desplegables para que el equipo valide la palanca y el sector
  const col = n => COLUMNAS.indexOf(n) + 1;
  PARTES.forEach(p => sh.getRange(2, col(p + '_palanca_validada'), 2000, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(PALANCAS), true).build()));
  sh.getRange(2, col('ocultar'), 2000, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  // Disparador: procesa pendientes cada minuto
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'procesarPendientes').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('procesarPendientes').timeBased().everyMinutes(1).create();
  if (!props.getProperty('PANEL_TOKEN')) {
    props.setProperty('PANEL_TOKEN', Utilities.getUuid().replace(/-/g, '').slice(0, 24));
  }
  Logger.log('Clave del panel (va en VOZ_CONFIG.token del prototipo): ' + props.getProperty('PANEL_TOKEN'));
  if (!props.getProperty('GEMINI_API_KEY')) {
    Logger.log('FALTA la clave: Configuración del proyecto > Propiedades del script > agregar GEMINI_API_KEY.');
  }
  Logger.log('Listo. Carpeta de audios: ' + DriveApp.getFolderById(props.getProperty('CARPETA_ID')).getUrl());
}

// ---------- Recepción del formulario ----------
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const d = JSON.parse(e.postData.contents);
    if (!d.id || !d.nombre || !d.organizacion) return json_({ ok: false, error: 'faltan datos' });
    if (d.consentimiento !== true) return json_({ ok: false, error: 'sin autorización' });
    const sh = hoja_();
    if (sh.getRange('A:A').createTextFinder(String(d.id)).matchEntireCell(true).findNext()) {
      return json_({ ok: true, duplicado: true }); // reenvío de una respuesta que ya llegó
    }
    const fila = {
      id: d.id, recibido: new Date(),
      nombre: corto_(d.nombre, 120), organizacion: corto_(d.organizacion, 160), rol: corto_(d.rol, 120),
      estado_ia: 'pendiente', intentos: 0, ocultar: false, estado: 'sin verificar', consentimiento: 'sí'
    };
    const carpeta = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('CARPETA_ID'));
    PARTES.forEach(p => {
      const r = d[p] || {};
      fila[p + '_escrita'] = corto_(r.texto, 3000);
      if (r.audio && r.audio.base64) {
        const mime = String(r.audio.mime || 'audio/webm').split(';')[0];
        const ext = /mp4|m4a|aac/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : 'webm';
        const nombre = [p, limpiar_(d.organizacion), limpiar_(d.nombre), String(d.id).slice(0, 8)].join('_') + '.' + ext;
        const archivo = carpeta.createFile(Utilities.newBlob(Utilities.base64Decode(r.audio.base64), mime, nombre));
        fila[p + '_audio_url'] = archivo.getUrl(); fila[p + '_audio_id'] = archivo.getId();
      }
    });
    sh.appendRow(COLUMNAS.map(c => fila[c] === undefined ? '' : fila[c]));
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

// ---------- Transcripción y ubicación en palancas (cada minuto) ----------
function procesarPendientes() {
  // Marca en caché para que no corran dos procesamientos a la vez (sin bloquear al formulario)
  const cache = CacheService.getScriptCache();
  if (cache.get('procesando')) return;
  cache.put('procesando', '1', 330);
  try {
    const sh = hoja_();
    const datos = sh.getDataRange().getValues();
    const cab = datos[0], c = n => cab.indexOf(n);
    let hechos = 0;
    for (let r = 1; r < datos.length && hechos < POR_LOTE; r++) {
      const f = datos[r];
      if (f[c('estado_ia')] !== 'pendiente' || Number(f[c('intentos')]) >= MAX_INTENTOS) continue;
      hechos++;
      const filaHoja = r + 1;
      sh.getRange(filaHoja, c('intentos') + 1).setValue(Number(f[c('intentos')] || 0) + 1);
      try {
        PARTES.forEach(p => {
          if (!f[c(p + '_escrita')] && !f[c(p + '_audio_id')]) return;
          if (f[c(p + '_palanca')] || f[c(p + '_transcripcion')]) return; // ya quedó procesada en un intento anterior
          const res = analizar_(p, f[c(p + '_escrita')], f[c(p + '_audio_id')]);
          const escribir = { transcripcion: res.transcripcion || '', palanca: res.palanca || '', palanca_2: res.palanca_secundaria || '',
            sector: res.sector || '', resumen: res.resumen || '', confianza: res.confianza || '' };
          Object.keys(escribir).forEach(k => sh.getRange(filaHoja, c(p + '_' + k) + 1).setValue(escribir[k]));
        });
        sh.getRange(filaHoja, c('estado_ia') + 1).setValue('listo');
      } catch (err) {
        // Si Gemini está saturado (503) o con límite (429) no se gasta un intento: la fila vuelve a la cola.
        const transitorio = /503|429|UNAVAILABLE|high demand|saturad/i.test(String(err));
        const recibido = new Date(f[c('recibido')]).getTime();
        const minutos = recibido ? (Date.now() - recibido) / 60000 : 999;
        if (transitorio && minutos < 90) {
          sh.getRange(filaHoja, c('intentos') + 1).setValue(Number(f[c('intentos')] || 0));
          sh.getRange(filaHoja, c('estado_ia') + 1).setValue('pendiente');
        } else {
          const agotado = Number(f[c('intentos')] || 0) + 1 >= MAX_INTENTOS;
          sh.getRange(filaHoja, c('estado_ia') + 1).setValue(agotado ? 'error: ' + String(err).slice(0, 180) : 'pendiente');
        }
      }
    }
  } finally {
    cache.remove('procesando');
  }
}

function analizar_(parte, textoEscrito, audioId) {
  const clave = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!clave) throw new Error('falta GEMINI_API_KEY');
  const partes = [{ text: instrucciones_(parte, textoEscrito, !!audioId) }];
  if (audioId) {
    const blob = DriveApp.getFileById(audioId).getBlob();
    let mime = blob.getContentType() || 'audio/webm';
    if (/mp4|m4a/.test(mime)) mime = 'audio/mp4';
    partes.push({ inline_data: { mime_type: mime, data: Utilities.base64Encode(blob.getBytes()) } });
  }
  const cuerpo = {
    contents: [{ role: 'user', parts: partes }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          transcripcion: { type: 'STRING' },
          palanca: { type: 'STRING', enum: Object.keys(PALANCAS) },
          palanca_secundaria: { type: 'STRING', enum: Object.keys(PALANCAS).concat(['ninguna']) },
          sector: { type: 'STRING', enum: Object.keys(SECTORES) },
          resumen: { type: 'STRING' },
          confianza: { type: 'STRING', enum: ['alta', 'media', 'baja'] }
        },
        required: ['transcripcion', 'palanca', 'sector', 'resumen', 'confianza']
      }
    }
  };
  let ultimoError = '';
  for (const modelo of modeloEnUso_()) {
    const resp = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-goog-api-key': clave }, payload: JSON.stringify(cuerpo)
    });
    const code = resp.getResponseCode();
    if (code === 404 || code === 429 || code === 500 || code === 503) { // no disponible, saturado o con límite: prueba el siguiente modelo
      ultimoError = modelo + ' respondió ' + code;
      PropertiesService.getScriptProperties().deleteProperty('MODELO_OK');
      continue;
    }
    if (code !== 200) throw new Error('Gemini ' + code + ': ' + resp.getContentText().slice(0, 200));
    const j = JSON.parse(resp.getContentText());
    const txt = (((j.candidates || [])[0] || {}).content || { parts: [] }).parts.map(p => p.text || '').join('');
    const out = JSON.parse(txt);
    if (out.palanca === 'ninguna') out.palanca = '';
    if (out.palanca_secundaria === 'ninguna' || out.palanca_secundaria === out.palanca) out.palanca_secundaria = '';
    if (!audioId && textoEscrito) out.transcripcion = ''; // no hubo audio: el texto escrito ya está en su columna
    PropertiesService.getScriptProperties().setProperty('MODELO_OK', modelo);
    return out;
  }
  throw new Error(ultimoError || 'ningún modelo respondió');
}

function instrucciones_(parte, textoEscrito, hayAudio) {
  return [
    'Eres analista del sistema de inteligencia territorial de la Cámara de Comercio de Cartagena para el Plan Nacional de Desarrollo 2026-2030.',
    'Un asistente a la Junta de Juntas respondió a esta pregunta: ' + PREGUNTAS[parte],
    hayAudio ? 'Su respuesta está en la nota de voz adjunta (español de Colombia, puede haber ruido de fondo).' : '',
    textoEscrito ? 'También escribió: «' + textoEscrito + '»' : '',
    '',
    'Tareas:',
    '1. transcripcion: transcribe literalmente la nota de voz, en español, con puntuación. No resumas ni corrijas el contenido. Quita solo muletillas repetidas ("eh", "este"). Si no hay audio, deja vacío.',
    '2. palanca: escoge SIEMPRE UNA palanca, la condición que más movería lo que la persona dijo. Una palanca es una condición que, al modificarse, mejora el desempeño de más de un sector. Aunque la respuesta sea general, abstracta o toque varios temas, escoge la más cercana y nunca la dejes vacía; en ese caso marca la confianza como "baja".',
    '   Palancas: ' + Object.keys(PALANCAS).map(k => k + ' = ' + PALANCAS[k]).join(' | '),
    '3. palanca_secundaria: otra palanca que también toca claramente, o "ninguna".',
    '4. sector: el sector económico al que se refiere o del que habla la persona. Opciones: ' + Object.keys(SECTORES).map(k => k + ' = ' + SECTORES[k]).join(' | '),
    '5. resumen: una frase de máximo 20 palabras con lo que afirma o se compromete a hacer, en tercera persona y sin adornos.',
    '6. confianza: alta si la palanca es evidente; media si hay dos opciones razonables; baja si el audio no se entiende, o si la respuesta es ambigua o demasiado general.',
    'No inventes nada que la persona no haya dicho.'
  ].filter(Boolean).join('\n');
}

function modeloEnUso_() {
  const ok = PropertiesService.getScriptProperties().getProperty('MODELO_OK');
  return ok ? [ok].concat(MODELOS.filter(m => m !== ok)) : MODELOS;
}

// ---------- Datos para la pantalla ----------
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.accion !== 'datos') return json_({ ok: true, servicio: 'La voz de la Junta' });
  // Los datos solo salen con la clave del panel (Propiedades del script > PANEL_TOKEN).
  // El formulario no la necesita: envía por doPost, que sigue abierto.
  const token = PropertiesService.getScriptProperties().getProperty('PANEL_TOKEN');
  if (!token || String(p.token || '') !== token) {
    const err = JSON.stringify({ ok: false, error: 'no autorizado' });
    if (p.callback && /^[A-Za-z_$][\w$]{0,60}$/.test(p.callback)) {
      return ContentService.createTextOutput(p.callback + '(' + err + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(err).setMimeType(ContentService.MimeType.JSON);
  }
  const filas = hoja_().getDataRange().getValues();
  const cab = filas.shift(), i = n => cab.indexOf(n);
  const voces = [];
  filas.filter(r => r[i('id')] && r[i('ocultar')] !== true).forEach(r => {
    PARTES.forEach((p, n) => {
      const texto = r[i(p + '_transcripcion')] || r[i(p + '_escrita')] || '';
      if (!texto && !r[i(p + '_audio_id')]) return;
      const validada = r[i(p + '_palanca_validada')];
      voces.push({
        momento: n + 1, nombre: r[i('nombre')], organizacion: r[i('organizacion')],
        texto: texto, resumen: r[i(p + '_resumen')],
        palanca: validada || r[i(p + '_palanca')], palanca_2: r[i(p + '_palanca_2')], sector: r[i(p + '_sector')],
        validada: !!validada, confianza: r[i(p + '_confianza')],
        procesando: r[i('estado_ia')] === 'pendiente', audio: !!r[i(p + '_audio_id')]
      });
    });
  });
  const salida = JSON.stringify({ ok: true, voces: voces, actualizado: new Date().toISOString() });
  if (p.callback && /^[A-Za-z_$][\w$]{0,60}$/.test(p.callback)) {
    return ContentService.createTextOutput(p.callback + '(' + salida + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(salida).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Utilidades ----------
function hoja_() { return SpreadsheetApp.openById(SHEET_ID).getSheetByName(HOJA); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function corto_(s, n) { return String(s == null ? '' : s).slice(0, n); }
function limpiar_(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').slice(0, 30); }

// ---------- Pruebas (ejecutar desde el editor) ----------
/** 1) Confirma la clave, lista los modelos Gemini disponibles y prueba una clasificación de texto. */
function verificarGemini() {
  const clave = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!clave) { Logger.log('Falta GEMINI_API_KEY en Propiedades del script.'); return; }
  const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
    { headers: { 'x-goog-api-key': clave }, muteHttpExceptions: true });
  const nombres = (JSON.parse(r.getContentText()).models || []).map(m => m.name.replace('models/', ''));
  Logger.log('Modelos configurados disponibles: ' + MODELOS.filter(m => nombres.indexOf(m) >= 0).join(', '));
  Logger.log('Resultado de prueba: ' + JSON.stringify(analizar_('vision',
    'Cartagena debe ser un hub industrial, no solo turístico; para eso necesitamos energía confiable en Mamonal.', '')));
}
/** 2) Transcribe y clasifica la última nota de voz recibida, sin tocar la hoja. */
function probarUltimoAudio() {
  const datos = hoja_().getDataRange().getValues(), cab = datos[0];
  for (let r = datos.length - 1; r > 0; r--) {
    for (const p of PARTES) {
      const id = datos[r][cab.indexOf(p + '_audio_id')];
      if (id) { Logger.log(p + ': ' + JSON.stringify(analizar_(p, '', id), null, 2)); return; }
    }
  }
  Logger.log('Todavía no hay notas de voz en la hoja.');
}

/** Vuelve a poner en cola las filas que quedaron en error (por saturación de Gemini, por ejemplo). */
function reintentarErrores() {
  const sh = hoja_(), d = sh.getDataRange().getValues(), cab = d[0];
  const ce = cab.indexOf('estado_ia') + 1, ci = cab.indexOf('intentos') + 1;
  let n = 0;
  for (let r = 1; r < d.length; r++) {
    if (String(d[r][ce - 1]).indexOf('error') === 0) { sh.getRange(r + 1, ce).setValue('pendiente'); sh.getRange(r + 1, ci).setValue(0); n++; }
  }
  Logger.log('Filas devueltas a la cola: ' + n);
}
