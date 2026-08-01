---
type: Note
_width: wide
---
# Instrucciones para el tracking

## Justificación

Para este proyecto es importante llevar un seguimiento de los tiempos reales, con precisión al minuto, el esfuerzo, el hito y otros ítems, para poder evaluar la cantidad de tiempo dedicada a diversas tareas y poder extraer información valiosa del proceso de creación y desarrollo.

## Alcance

**Todas** las tareas realizadas por la IA y los humanos vinculados al proyecto deben registrarse, así sean tareas de planeación, preparación o discusion.

Esta guía y el archivo CSV referenciado a continuación son, específicamente, para la IA.

## Componentes

Para dicha tarea, se debe consignar, luego de cada tarea, una fila en el documento [[tracking.csv]], que tiene las siguientes columnas:

### Stage

Es la etapa de desarrollo. Por lo general, se refiere a etapas como:

- `Specs definition`: definición de especificaciones generales y por componente. Por lo general se produce al inicio del proyecto.
- `Workspace settting`: configuración del espacio local para desarrollo. Incluye configuración de herramientas para IA.
- `Scaffold`: montaje inicial de frameworks, dependencias y paquetes.
- `Cloud infraestructure`: construcción de recursos en la nube, como bases de datos, espacios de alojamiento, activación de herramientas de autenticación, gestión de DNS y dominios y otros.
- `Auth connection`: conexión a sistemas de autenticación.
- `Frontend`: desarrollo de interfaces de usuario UX/UI.
- `Backend`: desarrollo de bases de datos, APIs, y otros recursos de servidor.

### Start

Fecha y hora de inicio de la tarea que se está ejecutando. Siempre debe estar en la hora local (normalmente UTF-5, hora de Bogota/Colombia) y su formato es `16/07/2026 16:23`.

### Finish

Fecha y hora de finalización de la tarea que se está ejecutando. Siempre debe estar en la hora local (normalmente UTF-5, hora de Bogota/Colombia) y su formato es `16/07/2026 16:33`.

### Time

Tiempo total que tomó la realización de la tarea, en formato `0:14:00`; a pesar de que el formato permite segundos, solo se debe calcular en horas y minutos.

### Role

El tipo de agente que desarrolló la tarea; solo existen dos posibilidades: `human` y `AI`.

### Model

El modelo, ya sea de humano o IA que desarrolló la tarea. En el caso de los humanos, se usarán las iniciales del nombre, por ejemplo, `OCM`. En el caso de los modelos de IA, se deberá indicar el modelo LLM y la versión; por ejemplo, `Sonnet 5`, `Opus 5`, `Kimi K3`, etc.

### Milestone

La descripción corta de la tarea realizada, con un máximo de 15 palabras.

### Tool

La herramienta usada para desarrollar la tarea; en el caso de la IA, la interfaz de trabajo, por ejemplo, `Claude Code`, `OpenCode`, etc. En el caso de los humanos, la herramienta usada por el humano, como `Github`, `AWS Console`, `Firebase Console`, `GCP Console`, `Editor Markdown`, etc.

### Device

El dispositivo desde donde se realizó la tarea. Puede ser `mobile`, `cli`, `web` o `desktop`.

### Effort

El esfuerzo que ha generado la tarea; por lo general, `high`, `medium` y `low`, aunque pueden existir otros niveles.
