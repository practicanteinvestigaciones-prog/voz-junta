# Plan para el evento — viernes 25 de septiembre de 2026

Estado al miércoles 23. El sistema está corriendo y probado con carga. Falta la pieza de logos y el habeas data.

## Lo que ya funciona

**Capacidad.** El motor se reescribió el martes y se probó con **200 respuestas simuladas** — 408 voces, contando visión y compromiso por separado. Resultado: **408 de 408 clasificadas, ninguna fallida, en menos de tres minutos**. La meta era cinco.

Los tres cambios que lo lograron:

| Cambio | Qué se hizo | Qué ganó |
| --- | --- | --- |
| Sin candado en la recepción | El envío no toca la hoja: guarda audio y ficha en Drive y responde de una. El proceso de cada minuto arma las filas en bloque. | Los 200 envíos dejan de hacer fila. El envío de prueba respondió en 2,5 segundos |
| Llamadas en paralelo | `UrlFetchApp.fetchAll`, hasta 25 transcripciones a la vez | 400 transcripciones de 25 minutos a unos 3 |
| Dos etapas con su clave cada una | Etapa 1 audio → texto. Etapa 2 texto → palanca, sector, resumen y palabras, **de a 20 en una sola llamada** | Las 400 llamadas de clasificación se vuelven 20 |

> Los límites de Gemini se aplican **por proyecto, no por clave**. Las dos claves salen de dos proyectos distintos de Google Cloud. Ver <https://ai.google.dev/gemini-api/docs/rate-limits>.

**Nube de palabras.** Reemplazó al árbol que se había pensado al principio. Cada respuesta devuelve de una a tres palabras de impacto en la misma llamada de clasificación, sin sumar tiempo ni costo. En pantalla, el tamaño de cada palabra depende de cuánta gente la dijo y el color de su familia de palanca.

Decisiones tomadas sobre la nube:

- **Vocabulario mixto.** Un núcleo curado de 30 palabras sacadas del PND y de las nueve palancas, más cualquier palabra de fuera **que tres o más personas repitan**. Así la nube se puede sorprender sola sin llenarse de ruido. Las palabras de fuera se pintan en gris, para distinguir lo que trajo la sala de lo que estaba previsto.
- **Sin palabras vacías.** A la IA se le piden sustantivos de contenido, y el panel filtra además artículos, preposiciones y todo lo de menos de cuatro letras.
- **Logos al tocar la palabra.** La nube se mantiene limpia; al tocar una palabra, aparecen abajo las organizaciones que la dijeron. Mientras no haya catálogo de logos, cada una sale con un escudo de iniciales.
- **Dos secciones, no cinco.** La vista muestra *Nube de palabras* o *Palancas y voces*, una a la vez. Al proyectar se esconde el texto explicativo y la pieza ocupa la pantalla.

## Lo que falta

| Qué | Quién | Por qué bloquea |
| --- | --- | --- |
| **Lista de organizaciones invitadas** | Yolvis | Sin ella no hay catálogo de logos y todas salen con escudo de iniciales |
| **Habeas data del formulario** | Yolvis, con la Secretaría | El texto de autorización actual está mal. Sin autorización bien redactada, las voces se recogen en falso |
| Ensayo con teléfonos reales | Equipo | Es lo único del camino que no se ha probado de punta a punta: grabar desde un celular, en el sitio, con el wifi del sitio |
| Bajar la grabación de 90 a 60 segundos | — | Transcribir es lo caro; 60 segundos alcanzan |
| Quitar el diagnóstico temporal del backend | — | Antes de congelar el código el jueves |

## Riesgos y plan B

| Riesgo | Plan B |
| --- | --- |
| El wifi del sitio no aguanta 200 celulares subiendo audio | El formulario guarda en el teléfono y reintenta solo; probar el wifi el jueves y, si falla, invitar a responder escribiendo |
| Gemini se satura | Cuatro modelos de respaldo por etapa; un 503 no gasta intentos y la fila vuelve a la cola |
| La IA ubica mal una palanca | La columna `*_palanca_validada` manda sobre la de la IA; se corrige en la hoja y el panel se actualiza en 20 segundos |
| Una palabra sobra en la nube | Se corrige en la hoja y desaparece de la pantalla en el siguiente refresco |
| Alguien graba algo inapropiado | La casilla `ocultar` saca esa voz del panel al instante, sin borrarla |

**El viernes no se estrena nada.** Todo lo que se proyecte tiene que haber corrido el jueves, con gente real y en el sitio.

## Pendientes después del evento

- Mover la hoja, los audios y el script de una cuenta personal a una cuenta institucional de la Cámara.
- Compartir la carpeta de audios con el Departamento de Investigaciones Económicas.
- Activar la facturación en **los dos** proyectos de Google Cloud, no en uno.
