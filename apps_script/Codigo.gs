/**
 * La voz de la Junta — backend v2 (Junta de Juntas, PND 2026-2030)
 *
 * Qué cambió frente a la v1, y por qué:
 *  1. El formulario ya no toca la hoja ni toma candados. Guarda el audio y una ficha
 *     en Drive y responde de una. Con 200 personas enviando a la vez, nadie hace fila.
 *  2. Las llamadas a Gemini van en paralelo (UrlFetchApp.fetchAll), no una por una.
 *  3. Dos etapas independientes, cada una con su propia clave (proyectos distintos):
 *       Etapa 1  audio  -> texto      GEMINI_API_KEY
 *       Etapa 2  texto  -> palanca    GEMINI_API_KEY_2, de a 20 respuestas por llamada
 *  4. La hoja se escribe por columnas completas, no celda por celda.
 *
 * Montaje: ver README.md. Antes del evento ejecute verificarClaves().
 */

// ---------- Configuración ----------
const HOJA = 'Voces';
const SHEET_ID = 'PEGUE_AQUI_EL_ID_DE_SU_HOJA';

const CLAVE_AUDIO = 'GEMINI_API_KEY';    // proyecto 1: transcripción
const CLAVE_TEXTO = 'GEMINI_API_KEY_2';  // proyecto 2: clasificación

const MODELOS_AUDIO = ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];
const MODELOS_TEXTO = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-flash-latest'];

const LOTE_AUDIO = 25;   // transcripciones en paralelo por tanda
const LOTE_TEXTO = 20;   // respuestas clasificadas en una sola llamada
const SEG_MAX = 260;     // segundos de trabajo por ejecución (el tope de Apps Script son 360)
const MAX_INTENTOS = 8;

const PARTES = ['vision', 'compromiso'];
const CAMPOS_PARTE = ['escrita', 'audio_url', 'audio_id', 'transcripcion', 'palanca', 'palanca_2', 'sector', 'resumen', 'confianza', 'palanca_validada'];
const COLUMNAS = ['id', 'recibido', 'nombre', 'organizacion', 'rol']
  .concat(...PARTES.map(p => CAMPOS_PARTE.map(c => p + '_' + c)))
  .concat(['estado_ia', 'intentos', 'ocultar', 'estado', 'notas_equipo', 'consentimiento'])
  .concat(PARTES.map(p => p + '_palabras'));  // al final, para no mover las columnas existentes

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
  vision: '¿qué visión tiene para Cartagena y Bolívar?',
  compromiso: '¿cuál es su compromiso concreto? (algo que su organización hará o aportará)'
};

// Nucleo curado de palabras de impacto. La IA prefiere estas; si alguien dice otra,
// se guarda igual y el panel la muestra solo cuando tres o mas personas la repiten.
const VOCABULARIO = ['vias','puerto','aeropuerto','conectividad','logistica','energia','tarifas','agua','acueducto','riego','dique','clima','erosion','formalizacion','tramites','regulacion','credito','financiamiento','garantias','mipyme','talento','bilinguismo','turismo','industria','agro','empleo','pobreza','inclusion','ruralidad','instituciones'];

// ---------- Montaje ----------
function configurar() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  if (ss.getName() !== 'La voz de la Junta') ss.rename('La voz de la Junta');
  let sh = ss.getSheetByName(HOJA);
  if (!sh) { sh = ss.insertSheet(HOJA); const h1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1'); if (h1) ss.deleteSheet(h1); }
  sh.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CARPETA_ID')) props.setProperty('CARPETA_ID', DriveApp.createFolder('La voz de la Junta - audios').getId());
  if (!props.getProperty('BANDEJA_ID')) props.setProperty('BANDEJA_ID', DriveApp.createFolder('La voz de la Junta - bandeja').getId());
  if (!props.getProperty('PANEL_TOKEN')) props.setProperty('PANEL_TOKEN', Utilities.getUuid().replace(/-/g, '').slice(0, 24));
  const col = n => COLUMNAS.indexOf(n) + 1;
  PARTES.forEach(p => sh.getRange(2, col(p + '_palanca_validada'), 2000, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(PALANCAS), true).build()));
  sh.getRange(2, col('ocultar'), 2000, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'procesarPendientes').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('procesarPendientes').timeBased().everyMinutes(1).create();
  Logger.log('Clave del panel: ' + props.getProperty('PANEL_TOKEN'));
  Logger.log('Audios: ' + DriveApp.getFolderById(props.getProperty('CARPETA_ID')).getUrl());
  Logger.log('Bandeja: ' + DriveApp.getFolderById(props.getProperty('BANDEJA_ID')).getUrl());
  if (!props.getProperty(CLAVE_AUDIO) || !props.getProperty(CLAVE_TEXTO)) Logger.log('FALTAN CLAVES: ' + CLAVE_AUDIO + ' y ' + CLAVE_TEXTO);
}

// ---------- Recepción: sin candado, sin tocar la hoja ----------
function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (!d.id || !d.nombre || !d.organizacion) return json_({ ok: false, error: 'faltan datos' });
    if (d.consentimiento !== true) return json_({ ok: false, error: 'sin autorización' });
    const props = PropertiesService.getScriptProperties();
    const carpeta = DriveApp.getFolderById(props.getProperty('CARPETA_ID'));
    const ficha = {
      id: String(d.id), nombre: corto_(d.nombre, 120),
      organizacion: corto_(d.organizacion, 160), rol: corto_(d.rol, 120)
    };
    PARTES.forEach(p => {
      const r = d[p] || {};
      ficha[p + '_escrita'] = corto_(r.texto, 3000);
      if (r.audio && r.audio.base64) {
        const mime = String(r.audio.mime || 'audio/webm').split(';')[0];
        const ext = /mp4|m4a|aac/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : 'webm';
        const nombre = [p, limpiar_(d.organizacion), limpiar_(d.nombre), String(d.id).slice(0, 8)].join('_') + '.' + ext;
        const archivo = carpeta.createFile(Utilities.newBlob(Utilities.base64Decode(r.audio.base64), mime, nombre));
        ficha[p + '_audio_url'] = archivo.getUrl();
        ficha[p + '_audio_id'] = archivo.getId();
      }
    });
    DriveApp.getFolderById(props.getProperty('BANDEJA_ID'))
      .createFile(String(d.id) + '.json', JSON.stringify(ficha), 'application/json');
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ---------- Proceso de cada minuto ----------
function procesarPendientes() {
  const cache = CacheService.getScriptCache();
  if (cache.get('procesando')) return;
  cache.put('procesando', '1', SEG_MAX + 40);
  const t0 = Date.now();
  try {
    ingresarFichas_();
    while ((Date.now() - t0) / 1000 < SEG_MAX) {
      const a = transcribirTanda_();
      const b = clasificarTanda_();
      if (!a && !b) break;
    }
    actualizarEstados_();
  } finally {
    cache.remove('procesando');
  }
}

/** Pasa las fichas de la bandeja de Drive a filas de la hoja, todas de un golpe. */
function ingresarFichas_() {
  const bandeja = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('BANDEJA_ID'));
  const it = bandeja.getFiles();
  const fichas = [], archivos = [];
  while (it.hasNext() && archivos.length < 300) {
    const f = it.next();
    archivos.push(f);
    try { fichas.push(JSON.parse(f.getBlob().getDataAsString())); } catch (x) {}
  }
  if (!archivos.length) return 0;
  const sh = hoja_();
  const ultima = sh.getLastRow();
  const vistos = {};
  if (ultima > 1) sh.getRange(2, 1, ultima - 1, 1).getValues().forEach(r => { if (r[0]) vistos[String(r[0])] = 1; });
  const filas = [];
  fichas.forEach(n => {
    if (!n || !n.id || vistos[String(n.id)]) return;
    vistos[String(n.id)] = 1;
    const o = { id: n.id, recibido: new Date(), nombre: n.nombre, organizacion: n.organizacion, rol: n.rol,
      estado_ia: 'pendiente', intentos: 0, ocultar: false, estado: 'sin verificar', consentimiento: 'sí' };
    PARTES.forEach(p => CAMPOS_PARTE.forEach(c => {
      if (n[p + '_' + c] !== undefined) o[p + '_' + c] = n[p + '_' + c];
    }));
    filas.push(COLUMNAS.map(c => o[c] === undefined ? '' : o[c]));
  });
  if (filas.length) sh.getRange(sh.getLastRow() + 1, 1, filas.length, COLUMNAS.length).setValues(filas);
  archivos.forEach(f => { try { f.setTrashed(true); } catch (x) {} });
  return filas.length;
}

/** Etapa 1: audio -> texto, hasta LOTE_AUDIO notas de voz en paralelo. */
function transcribirTanda_() {
  const sh = hoja_();
  const datos = sh.getDataRange().getValues();
  if (datos.length < 2) return 0;
  const cab = datos[0], c = n => cab.indexOf(n);
  const jobs = [];
  for (let r = 1; r < datos.length && jobs.length < LOTE_AUDIO; r++) {
    const f = datos[r];
    if (String(f[c('estado_ia')]).indexOf('error') === 0) continue;
    if (Number(f[c('intentos')]) >= MAX_INTENTOS) continue;
    for (const p of PARTES) {
      if (jobs.length >= LOTE_AUDIO) break;
      if (f[c(p + '_audio_id')] && !f[c(p + '_transcripcion')]) jobs.push({ r: r, p: p, id: f[c(p + '_audio_id')] });
    }
  }
  if (!jobs.length) return 0;

  const clave = PropertiesService.getScriptProperties().getProperty(CLAVE_AUDIO);
  if (!clave) throw new Error('falta ' + CLAVE_AUDIO);
  jobs.forEach(j => {
    const blob = DriveApp.getFileById(j.id).getBlob();
    let mime = blob.getContentType() || 'audio/webm';
    if (/mp4|m4a/.test(mime)) mime = 'audio/mp4';
    j.cuerpo = {
      contents: [{ role: 'user', parts: [
        { text: 'Transcribe literalmente esta nota de voz, en español de Colombia, con puntuación. No resumas, no corrijas, no agregues nada. Quita solo las muletillas repetidas. Responde únicamente con la transcripción.' },
        { inline_data: { mime_type: mime, data: Utilities.base64Encode(blob.getBytes()) } }
      ] }],
      generationConfig: { temperature: 0 }
    };
  });

  const pendientes = enParalelo_(jobs, MODELOS_AUDIO, clave, 'AUDIO');
  const cambios = {};
  jobs.forEach(j => {
    if (!j.texto) return;
    datos[j.r][c(j.p + '_transcripcion')] = j.texto;
    cambios[j.p + '_transcripcion'] = 1;
  });
  if (pendientes.length) marcarIntento_(datos, cab, pendientes);
  escribirColumnas_(sh, datos, cab, Object.keys(cambios).concat(pendientes.length ? ['intentos'] : []));
  return jobs.length - pendientes.length;
}

/** Etapa 2: texto -> palanca, sector, resumen y palabras. Hasta LOTE_TEXTO en UNA sola llamada. */
function clasificarTanda_() {
  const sh = hoja_();
  const datos = sh.getDataRange().getValues();
  if (datos.length < 2) return 0;
  const cab = datos[0], c = n => cab.indexOf(n);
  const items = [];
  for (let r = 1; r < datos.length && items.length < LOTE_TEXTO; r++) {
    const f = datos[r];
    if (String(f[c('estado_ia')]).indexOf('error') === 0) continue;
    if (Number(f[c('intentos')]) >= MAX_INTENTOS) continue;
    for (const p of PARTES) {
      if (items.length >= LOTE_TEXTO) break;
      if (f[c(p + '_palanca')]) continue;
      const texto = f[c(p + '_transcripcion')] || f[c(p + '_escrita')] || '';
      if (!texto) continue;
      if (f[c(p + '_audio_id')] && !f[c(p + '_transcripcion')]) continue; // espera a que se transcriba
      items.push({ r: r, p: p, texto: String(texto) });
    }
  }
  if (!items.length) return 0;

  const clave = PropertiesService.getScriptProperties().getProperty(CLAVE_TEXTO);
  if (!clave) throw new Error('falta ' + CLAVE_TEXTO);
  const job = {
    cuerpo: {
      contents: [{ role: 'user', parts: [{ text: instruccionesLote_(items) }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              n: { type: 'INTEGER' },
              palanca: { type: 'STRING', enum: Object.keys(PALANCAS) },
              palanca_secundaria: { type: 'STRING', enum: Object.keys(PALANCAS).concat(['ninguna']) },
              sector: { type: 'STRING', enum: Object.keys(SECTORES) },
              resumen: { type: 'STRING' },
              confianza: { type: 'STRING', enum: ['alta', 'media', 'baja'] },
              palabras: { type: 'ARRAY', items: { type: 'STRING' } }
            },
            required: ['n', 'palanca', 'sector', 'resumen', 'confianza', 'palabras']
          }
        }
      }
    }
  };

  const fallaron = enParalelo_([job], MODELOS_TEXTO, clave, 'TEXTO');
  if (fallaron.length || !job.texto) {
    marcarIntento_(datos, cab, items);
    escribirColumnas_(sh, datos, cab, ['intentos']);
    return 0;
  }
  let salida;
  try { salida = JSON.parse(job.texto); } catch (x) { salida = []; }
  if (!Array.isArray(salida)) salida = [];
  const cambios = {};
  salida.forEach(o => {
    const it = items[Number(o.n) - 1];
    if (!it || !o.palanca) return;
    const seg = (o.palanca_secundaria === 'ninguna' || o.palanca_secundaria === o.palanca) ? '' : (o.palanca_secundaria || '');
    const pares = [['palanca', o.palanca], ['palanca_2', seg], ['sector', o.sector || ''],
      ['resumen', o.resumen || ''], ['confianza', o.confianza || ''],
      ['palabras', (o.palabras || []).slice(0, 3).join(', ')]];
    pares.forEach(par => {
      datos[it.r][c(it.p + '_' + par[0])] = par[1];
      cambios[it.p + '_' + par[0]] = 1;
    });
  });
  escribirColumnas_(sh, datos, cab, Object.keys(cambios));
  return items.length;
}

function instruccionesLote_(items) {
  const lista = items.map((it, i) =>
    (i + 1) + '. Pregunta: ' + PREGUNTAS[it.p] + '\n   Respuesta: «' + it.texto.slice(0, 1200) + '»').join('\n');
  return [
    'Eres analista del sistema de inteligencia territorial de la Cámara de Comercio de Cartagena para el Plan Nacional de Desarrollo 2026-2030.',
    'Abajo hay ' + items.length + ' respuestas de asistentes a la Junta de Juntas. Clasifica CADA UNA por separado.',
    '',
    'Para cada respuesta devuelve:',
    '- n: el número de la respuesta, tal como aparece en la lista.',
    '- palanca: SIEMPRE una, la condición que más movería lo que la persona dijo. Una palanca es una condición que, al modificarse, mejora el desempeño de más de un sector. Aunque la respuesta sea general o toque varios temas, escoge la más cercana y nunca la dejes vacía; en ese caso marca la confianza como "baja".',
    '  Palancas: ' + Object.keys(PALANCAS).map(k => k + ' = ' + PALANCAS[k]).join(' | '),
    '- palanca_secundaria: otra palanca que también toca claramente, o "ninguna".',
    '- sector: ' + Object.keys(SECTORES).map(k => k + ' = ' + SECTORES[k]).join(' | '),
    '- resumen: una frase de máximo 20 palabras, en tercera persona y sin adornos.',
    '- confianza: alta si la palanca es evidente; media si hay dos opciones razonables; baja si la respuesta es ambigua o muy general.',
    '- palabras: de una a tres palabras de impacto. Escoge SIEMPRE que puedas de esta lista: ' + VOCABULARIO.join(', ') + '. Si lo que dijo la persona de verdad no encaja en ninguna, usa una palabra propia: un sustantivo comun en singular y en minuscula, escrito con sus tildes. Nunca uses articulos, preposiciones, conectores, verbos, nombres propios ni palabras de menos de cuatro letras.',
    '',
    'No inventes nada que la persona no haya dicho. Devuelve un objeto por cada una de las ' + items.length + ' respuestas.',
    '',
    lista
  ].join('\n');
}

/** Lanza todas las llamadas de una tanda a la vez y reintenta con el siguiente modelo las que se saturen. */
function enParalelo_(jobs, modelos, clave, tipo) {
  let quedan = jobs.slice();
  const props = PropertiesService.getScriptProperties();
  const preferido = props.getProperty('MODELO_' + tipo);
  const orden = preferido ? [preferido].concat(modelos.filter(m => m !== preferido)) : modelos.slice();
  for (const modelo of orden) {
    if (!quedan.length) break;
    const peticiones = quedan.map(j => ({
      url: 'https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent',
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-goog-api-key': clave }, payload: JSON.stringify(j.cuerpo)
    }));
    let respuestas;
    try { respuestas = UrlFetchApp.fetchAll(peticiones); } catch (err) { continue; }
    const siguen = [];
    respuestas.forEach((resp, i) => {
      const j = quedan[i], code = resp.getResponseCode();
      if (code !== 200) { siguen.push(j); return; }
      try {
        const cand = ((JSON.parse(resp.getContentText()).candidates || [])[0] || {}).content || { parts: [] };
        const txt = (cand.parts || []).map(x => x.text || '').join('').trim();
        if (txt) { j.texto = txt; } else { siguen.push(j); }
      } catch (x) { siguen.push(j); }
    });
    if (siguen.length < quedan.length) props.setProperty('MODELO_' + tipo, modelo);
    quedan = siguen;
  }
  return quedan;
}

function marcarIntento_(datos, cab, items) {
  const ci = cab.indexOf('intentos');
  const filas = {};
  items.forEach(it => { filas[it.r] = 1; });
  Object.keys(filas).forEach(r => { datos[r][ci] = Number(datos[r][ci] || 0) + 1; });
}

/** Escribe columnas completas (nunca las que edita el equipo a mano). */
function escribirColumnas_(sh, datos, cab, nombres) {
  const n = datos.length - 1;
  if (n < 1) return;
  const unicos = {};
  nombres.forEach(x => { if (x) unicos[x] = 1; });
  Object.keys(unicos).forEach(nombre => {
    const col = cab.indexOf(nombre) + 1;
    if (col < 1) return;
    const vals = [];
    for (let r = 1; r <= n; r++) vals.push([datos[r][col - 1]]);
    sh.getRange(2, col, n, 1).setValues(vals);
  });
}

/** Una fila queda "listo" cuando cada parte con contenido ya tiene su palanca. */
function actualizarEstados_() {
  const sh = hoja_();
  const datos = sh.getDataRange().getValues();
  if (datos.length < 2) return;
  const cab = datos[0], c = n => cab.indexOf(n);
  let cambio = false;
  for (let r = 1; r < datos.length; r++) {
    const f = datos[r];
    if (!f[c('id')]) continue;
    const actual = String(f[c('estado_ia')]);
    if (actual.indexOf('error') === 0) continue;
    let completa = true, algo = false;
    PARTES.forEach(p => {
      const hay = f[c(p + '_escrita')] || f[c(p + '_audio_id')];
      if (!hay) return;
      algo = true;
      if (!f[c(p + '_palanca')]) completa = false;
    });
    let nuevo = actual;
    if (algo && completa) nuevo = 'listo';
    else if (Number(f[c('intentos')]) >= MAX_INTENTOS) nuevo = 'error: no se pudo procesar después de ' + MAX_INTENTOS + ' intentos';
    else nuevo = 'pendiente';
    if (nuevo !== actual) { datos[r][c('estado_ia')] = nuevo; cambio = true; }
  }
  if (cambio) escribirColumnas_(sh, datos, cab, ['estado_ia']);
}

// ---------- Datos para la pantalla ----------
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.accion !== 'datos') return json_({ ok: true, servicio: 'La voz de la Junta' });
  const token = PropertiesService.getScriptProperties().getProperty('PANEL_TOKEN');
  if (!token || String(p.token || '') !== token) return salida_(p, { ok: false, error: 'no autorizado' });
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
        palabras: String(r[i(p + '_palabras')] || '').split(',').map(s => s.trim()).filter(Boolean),
        validada: !!validada, confianza: r[i(p + '_confianza')],
        procesando: !r[i(p + '_palanca')] && !validada, audio: !!r[i(p + '_audio_id')]
      });
    });
  });
  return salida_(p, { ok: true, voces: voces, actualizado: new Date().toISOString() });
}

function salida_(p, obj) {
  const txt = JSON.stringify(obj);
  if (p.callback && /^[A-Za-z_$][\w$]{0,60}$/.test(p.callback)) {
    return ContentService.createTextOutput(p.callback + '(' + txt + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Utilidades ----------
function hoja_() { return SpreadsheetApp.openById(SHEET_ID).getSheetByName(HOJA); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function corto_(s, n) { return String(s == null ? '' : s).slice(0, n); }
function limpiar_(s) {
  const marcas = new RegExp('[' + String.fromCharCode(768) + '-' + String.fromCharCode(879) + ']', 'g');
  return String(s || '').normalize('NFD').replace(marcas, '').replace(/[^A-Za-z0-9]+/g, '-').slice(0, 30);
}

// ---------- Pruebas ----------
/** Confirma que las dos claves responden, sin mostrarlas. */
function verificarClaves() {
  const P = PropertiesService.getScriptProperties();
  const pares = [['clave 1 (transcripción)', P.getProperty(CLAVE_AUDIO), MODELOS_AUDIO],
    ['clave 2 (clasificación)', P.getProperty(CLAVE_TEXTO), MODELOS_TEXTO]];
  Logger.log('son distintas: ' + (!!pares[0][1] && !!pares[1][1] && pares[0][1] !== pares[1][1]));
  pares.forEach(par => {
    if (!par[1]) { Logger.log(par[0] + ': NO EXISTE'); return; }
    let ok = '';
    par[2].forEach(m => {
      if (ok) return;
      const g = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { 'x-goog-api-key': par[1] }, payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Responde solo: ok' }] }] })
      });
      Logger.log('   ' + m + ' -> ' + g.getResponseCode());
      if (g.getResponseCode() === 200) ok = m;
    });
    Logger.log(par[0] + ': ' + (ok ? 'FUNCIONA (' + ok + ')' : 'NINGÚN MODELO RESPONDIÓ'));
  });
}

/** Deja en cola otra vez las filas que quedaron en error. */
function reintentarErrores() {
  const sh = hoja_(), d = sh.getDataRange().getValues(), cab = d[0];
  const ce = cab.indexOf('estado_ia'), ci = cab.indexOf('intentos');
  let n = 0;
  for (let r = 1; r < d.length; r++) {
    if (String(d[r][ce]).indexOf('error') === 0) { d[r][ce] = 'pendiente'; d[r][ci] = 0; n++; }
  }
  if (n) escribirColumnas_(sh, d, cab, ['estado_ia', 'intentos']);
  Logger.log('Filas devueltas a la cola: ' + n);
}

/** Simula envíos para la prueba de carga. No usa Gemini: solo llena la bandeja. */
function simularCarga_(cuantos) {
  const bandeja = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('BANDEJA_ID'));
  const frases = [
    'Necesitamos energía confiable en Mamonal para que la industria crezca',
    'El Canal del Dique nos tiene ahogados, sin eso no hay agro',
    'Hay que formalizar a los pequeños comerciantes del centro',
    'Falta talento bilingüe para el turismo y para el puerto',
    'Sin vías terciarias el campo de Bolívar no saca su cosecha',
    'Queremos que el crédito llegue de verdad a la mipyme'
  ];
  for (let i = 0; i < (cuantos || 200); i++) {
    const f = {
      id: 'prueba-' + Utilities.getUuid(),
      nombre: 'Prueba ' + (i + 1), organizacion: 'Organización ' + ((i % 25) + 1), rol: 'Gerente',
      vision_escrita: frases[i % frases.length],
      compromiso_escrita: 'Nos comprometemos a ' + frases[(i + 3) % frases.length].toLowerCase()
    };
    bandeja.createFile(f.id + '.json', JSON.stringify(f), 'application/json');
  }
  Logger.log('Fichas de prueba creadas: ' + (cuantos || 200));
}

/** Prueba de carga: crea 200 respuestas simuladas en la bandeja. */
function pruebaCarga200() { simularCarga_(200); }

/** Borra las filas y fichas de prueba (las que tienen id que empieza por "prueba-"). */
function borrarPruebas() {
  const sh = hoja_(), d = sh.getDataRange().getValues();
  for (let r = d.length - 1; r >= 1; r--) {
    if (String(d[r][0]).indexOf('prueba-') === 0) sh.deleteRow(r + 1);
  }
  const bandeja = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('BANDEJA_ID'));
  const it = bandeja.getFiles();
  while (it.hasNext()) { const f = it.next(); if (f.getName().indexOf('prueba-') === 0) f.setTrashed(true); }
  Logger.log('Pruebas borradas.');
}
