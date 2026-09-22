# La voz de la Junta

En un solo formulario, cada asistente responde dos preguntas con su voz:

1. **Visión:** ¿qué visión tiene para Cartagena y Bolívar?
2. **Compromiso:** ¿cuál es su compromiso concreto?

Hay dos formas de montarlo. Escojan una.

---

## Opción A · Jotform (ya está lista)

- Formulario: https://form.jotform.com/262635579619068
- QR: `QR_La_voz_de_la_Junta.png`
- Cada pregunta tiene un micrófono: la persona habla y lo que dice queda escrito en la casilla. Puede revisar el texto antes de enviar.
- Las respuestas se ven en Jotform, en **Mis formularios › La voz de la Junta › Tablas**, y se descargan en Excel.
- **Para ubicar las respuestas en las palancas:** descarguen el Excel y pásenselo a Claude con esta instrucción:

  > Clasifica la visión y el compromiso de cada persona, por separado, en UNA de estas palancas: Conectividad, Energía, Agua, Clima, Reglas claras, Crédito, Formación, Brechas, Instituciones. Agrega también el sector (Marítimo, Energía, Turismo, Industria, Agro, Comercio exterior, Desarrollo empresarial, Hogares y social). Al final, da un conteo por palanca con las organizaciones de cada una.

- **Límite:** el dictado depende del navegador del celular. Si en algún teléfono no funciona, la persona escribe o usa el micrófono del teclado. Pruébenlo en un iPhone y en un Android.

---

## Opción B · Versión propia (graba el audio y la IA clasifica sola)

Esta opción guarda la nota de voz. Gemini la transcribe y la ubica en su palanca sin que nadie tenga que pasar el Excel. La pantalla del prototipo se actualiza en vivo.

| Archivo | Qué es |
|---|---|
| `captura/index.html` | El formulario, con dos botones de grabar (visión y compromiso) |
| `apps_script/Codigo.gs` | Guarda las respuestas en una hoja de Google y los audios en Drive; cada minuto transcribe y clasifica con Gemini |
| `Sistema_inteligencia_territorial_prototipo_v2.html` | Prototipo con la vista "La voz de la Junta" |
| `carteles_qr.html` | Genera el cartel con el QR |

### Montaje (unos 30 minutos)

1. **Hoja:** creen una hoja de Google. Vayan a **Extensiones › Apps Script**, peguen `Codigo.gs`, guarden, y ejecuten la función **configurar** (autoricen los permisos).
2. **Clave de Gemini:** saquen la clave en aistudio.google.com (**Get API key**). En Apps Script vayan a **Configuración del proyecto › Propiedades del script** y agreguen `GEMINI_API_KEY` con la clave. Ejecuten **verificarGemini**.
3. **Publicar el backend:** en Apps Script, **Implementar › Nueva implementación › Aplicación web**, con **Ejecutar como: Yo** y **Acceso: Cualquier persona**. Copien la URL que termina en `/exec`.
4. **Formulario:** peguen esa URL en `CONFIG.url`, dentro de `captura/index.html`. Publíquenlo en GitHub Pages; necesita https para usar el micrófono.
5. **Pantalla:** abran el prototipo agregando `?vista=voz&fuente=URL_DEL_EXEC` al final de la dirección.
6. **QR:** abran `carteles_qr.html`, peguen la dirección de GitHub Pages e impriman.

**En la hoja**, cada persona queda en una fila. Para la visión y para el compromiso hay columnas separadas con: texto escrito, audio, transcripción, palanca, palanca secundaria, sector, resumen y confianza. En `vision_palanca_validada` y `compromiso_palanca_validada` el equipo puede corregir a la IA. La casilla `ocultar` saca a una persona de la pantalla.

**Privacidad:** en el nivel gratuito de Gemini, Google puede usar los audios para mejorar sus productos. En el nivel de pago no. Conviene activar la facturación.
