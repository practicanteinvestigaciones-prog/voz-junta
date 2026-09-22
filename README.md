# La voz de la Junta

Sistema de captura y visualización de voces para la **Junta de Juntas** del Plan Nacional de Desarrollo 2026–2030 — Cámara de Comercio de Cartagena.

Cada asistente escanea un QR, responde **dos preguntas** (visión y compromiso) con una nota de voz o por escrito, y su respuesta se transcribe automáticamente y se ubica en una de las **nueve palancas** del sistema de inteligencia territorial. El resultado se proyecta en vivo.

## Cómo funciona

```
Celular ──► Apps Script (doPost) ──► Drive (audio) + Hoja "Voces"
                                          │
                        cada minuto ──► Gemini: transcribe y clasifica
                                          │
                       Apps Script (doGet, con clave) ──► Panel en pantalla
```

## Qué hay en este repositorio

| Ruta | Qué es |
| --- | --- |
| `index.html` | Página de captura. Es la que se publica en GitHub Pages y la que abre el QR. |
| `apps_script/Codigo.gs` | Backend completo: recepción, guardado en Drive, transcripción y clasificación con Gemini, y entrega de datos al panel. Se pega en un proyecto de Google Apps Script. |
| `panel/voz.js`, `panel/voz.css`, `panel/voz.html` | Vista «La voz de la Junta» del panel: indicadores, nueve palancas, matriz palanca × sector, muro de voces y modo proyección. |
| `panel/build.py` | Inserta esas tres piezas dentro del prototipo del sistema de inteligencia territorial y genera el HTML final. |
| `panel/Sistema_inteligencia_territorial_prototipo_v2.html` | El panel ya compilado, listo para proyectar. |
| `carteles_qr.html` | Generador del cartel A4 con el QR. Se abre en el navegador, se pega la dirección pública y se imprime. |
| `LEEME_montaje.md` | Pasos de montaje de principio a fin. |
| `PLAN.md` | Plan de trabajo y decisiones pendientes. |

## Lo que NO está aquí, a propósito

- **Ninguna clave.** Ni la de Gemini ni la del panel. La de Gemini va en *Configuración del proyecto → Propiedades del script* (`GEMINI_API_KEY`). La del panel la genera el propio script (`PANEL_TOKEN`) y se pasa al proyectar: `...panel.html?clave=LA_CLAVE`.
- **La dirección del backend ni el ID de la hoja.** `SHEET_ID` viene como marcador de posición, y el panel se abre pasándole la fuente y la clave: `panel.html?fuente=<dirección que termina en /exec>&clave=<clave del panel>`.

Quien clone este repositorio obtiene **el sistema completo, no los datos**. Las respuestas de las personas viven en la hoja y en la carpeta de Drive de la entidad, y solo las ve quien tenga permiso sobre ellas.

## Montaje rápido

1. Crear una hoja de cálculo en Google Sheets y copiar su ID.
2. Crear un proyecto en [script.google.com](https://script.google.com), pegar `apps_script/Codigo.gs` y poner ese ID en `SHEET_ID`.
3. En *Propiedades del script*, agregar `GEMINI_API_KEY`.
4. Ejecutar `configurar()` una vez. Crea la hoja `Voces`, la carpeta de audios en Drive, el disparador de cada minuto y la clave del panel (queda en el registro de ejecución).
5. Implementar como aplicación web, con acceso *Cualquier usuario*. Copiar la dirección que termina en `/exec`.
6. Pegar esa dirección en `index.html` (`CONFIG.url`) y publicar con GitHub Pages.
7. Generar el cartel con `carteles_qr.html` e imprimirlo.

Los detalles están en `LEEME_montaje.md`.

## Verificación antes de un evento

Desde el editor de Apps Script:

- `verificarGemini()` — confirma la clave y prueba una clasificación.
- `probarUltimoAudio()` — transcribe y clasifica la última nota de voz recibida, sin tocar la hoja.
- `reintentarErrores()` — devuelve a la cola las filas que quedaron en error.

## Datos personales

El formulario pide autorización explícita (Ley 1581 de 2012) antes de enviar. Los audios quedan en una carpeta de Drive de la entidad, las respuestas en la hoja, y el panel solo entrega datos con la clave. La columna `ocultar` saca una voz del panel sin borrarla.
