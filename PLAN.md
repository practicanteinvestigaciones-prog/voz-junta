# Plan para el evento — 25 de septiembre de 2026

Estado al 22 de septiembre. Meta: que 200 personas respondan a la vez y su voz quede ubicada en su palanca **en menos de tres minutos**, y cerrar el evento con un árbol de palabras de impacto donde cada organización se reconozca.

## Diagnóstico: tres cuellos de botella, no uno

1. **El candado del formulario.** Cada envío toma un candado exclusivo del script: las demás personas esperan en fila. Con 200 asistentes la cola supera los diez minutos y las últimas respuestas reciben error de espera. Es el riesgo real de colapso.
2. **Llamadas a Gemini en fila india.** 8 filas por minuto, dos llamadas por fila, una después de otra: 400 llamadas y 25 minutos en el mejor caso.
3. **Escritura celda por celda.** Unas 2.400 escrituras individuales a Google Sheets.

A eso se sumó la saturación del plan gratuito (`503 alta demanda`), ya mitigada con cinco modelos de respaldo y reintentos que no gastan intentos.

## Arquitectura nueva

| Cambio | Qué se hace | Qué gana |
| --- | --- | --- |
| Quitar el candado | El envío no toca la hoja: guarda audio y ficha en Drive y responde de una. El proceso de cada minuto arma las filas en bloque. | Los envíos dejan de hacer fila |
| Llamadas en paralelo | Decenas de llamadas simultáneas en vez de una por una | 400 transcripciones de 25 minutos a unos 3 |
| Escritura en bloque | Un solo bloque por tanda | Segundos en vez de minutos |
| Dos etapas separadas | Etapa 1: audio → texto. Etapa 2: texto → palanca, sector, resumen y palabras, **por lotes de 20 en una sola llamada** | Las 400 llamadas de clasificación se vuelven 20; quien escribe aparece en segundos |
| Dos proyectos de Google Cloud | Una clave por etapa, sacada de **proyectos distintos** | Cupos separados |

> **Ojo:** los límites de Gemini se aplican **por proyecto, no por clave**. Dos claves del mismo proyecto comparten cupo y no sirven de nada. Ver <https://ai.google.dev/gemini-api/docs/rate-limits>.

También: bajar el tope de grabación de 90 a 60 segundos.

## Árbol de palabras (pieza de cierre)

La extracción de palabras entra en la misma llamada de clasificación, sin sumar tiempo ni costo. A cada respuesta se le piden **dos o tres palabras de impacto** tomadas de un **vocabulario curado de 25 a 30 palabras**, definido a partir de los documentos del PND. Con vocabulario libre, 200 personas producen 200 palabras distintas y el árbol queda ilegible.

En pantalla: un árbol cuyas ramas crecen según cuántas personas usaron cada palabra, con los logos de las organizaciones posados en su rama. El logo se ubica en la palabra que esa organización más usó.

### Logos

La búsqueda automática en vivo no es viable: la API gratuita de logos de Clearbit fue descontinuada, los reemplazos funcionan por dominio y cubren mal a gremios y entidades colombianas, y un logo equivocado proyectado delante del gerente de esa empresa es peor que no tener logo.

Plan en tres capas:

1. **Catálogo previo** a partir de la lista de invitados: pestaña `Organizaciones` con nombre oficial, alias y logo.
2. **Autocompletado** de organización en el formulario, para no tener que adivinar si «CCC» y «Cámara de Comercio de Cartagena» son lo mismo.
3. **Escudo de iniciales** para toda organización sin logo, y posibilidad de pegar un logo en la hoja durante el evento.

## Ruta

- **Martes 22 — capacidad.** Subir el proyecto a GitHub. Crear los dos proyectos de Google Cloud con facturación. Reescribir el motor. Bajar la grabación a 60 s.
- **Miércoles 23 — prueba de carga, árbol y logos.** Simulación de 200 envíos. Aprobar el vocabulario. Catálogo de organizaciones. Autocompletado. Primera versión del árbol.
- **Jueves 24 — ensayo general.** Personas reales grabando desde sus teléfonos, en el sitio y con el wifi del sitio. Carteles impresos. Quitar el diagnóstico temporal y **congelar el código**.
- **Viernes 25 — evento.** Revisión 30 minutos antes. Alguien del equipo vigilando la hoja durante el evento.

El jueves es día de ensayo, no de construcción. **El viernes no se estrena nada.**

## Riesgos y plan B

| Riesgo | Plan B |
| --- | --- |
| El wifi del sitio no aguanta 200 celulares subiendo audio | El formulario guarda en el teléfono y reintenta solo; probar el wifi el jueves y, si falla, invitar a responder escribiendo |
| Las claves con facturación no quedan a tiempo | Plan gratuito con cinco modelos de respaldo: funciona, pero puede tardar más |
| El árbol no queda listo | Cerrar con el panel de palancas, ya probado |
| Llegan organizaciones fuera de la lista | Escudo de iniciales y logos pegados en vivo |
| La IA ubica mal una palanca | La columna `*_palanca_validada` manda sobre la de la IA; se corrige y el panel se actualiza en 20 segundos |
| Alguien graba algo inapropiado | La casilla `ocultar` saca esa voz del panel al instante |

## Pendientes de gobernanza (después del evento)

- Mover la hoja, los audios y el script de una cuenta personal a una cuenta institucional de la Cámara.
- Compartir la carpeta de audios con el Departamento de Investigaciones Económicas.
- Confirmar el nombre legal de la entidad y la dirección de la política de tratamiento de datos que aparece en el formulario.
