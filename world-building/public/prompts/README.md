# 📁 Prompts de la IA — Cómo usar esta carpeta

Esta carpeta contiene los **archivos de instrucciones** que controlan cómo se comporta
el Asistente IA (Ollama) al generar o mejorar contenido para cada tipo de tarjeta.

## Archivos disponibles

| Archivo | Para qué tipo de tarjeta |
|---|---|
| `character.md` | Personajes |
| `location.md` | Localizaciones y lugares |
| `faction.md` | Facciones y organizaciones |
| `magic_spell.md` | Hechizos y elementos mágicos |
| `group.md` | Grupos / Frames |
| `general.md` | General (también es el fallback) |

## Cómo editar un prompt

1. Abre el archivo del tipo que quieres personalizar con cualquier editor de texto
   (Bloc de notas, VS Code, Notepad++, etc.)
2. Dentro de cada archivo hay dos secciones:
   - **`## REWRITE`** — Instrucciones para el botón "Mejorar y Rellenar Tarjeta"
   - **`## PROMPT`** — Instrucciones para el botón "Generar y Rellenar Tarjeta"
3. Edita el texto de la sección que quieras y guarda el archivo.
4. La próxima vez que uses el botón ✨ en una tarjeta de ese tipo, la IA usará tu nuevo texto.

## Consejos

- **No cambies las líneas `## REWRITE` y `## PROMPT`** — son marcadores que usa la app para saber qué sección es cuál.
- Las líneas que empiezan con `<!--` son comentarios y la IA no las lee.
- Puedes cambiar el idioma, el estilo, agregar o quitar instrucciones.
- Si un archivo no se puede leer, la app usa `general.md` automáticamente como respaldo.

## ¿Qué puede pedirle a la IA en los prompts?

Puedes instruirle que:
- Escriba con un estilo específico (oscuro, humorístico, épico, minimalista...)
- Incluya o excluya ciertas secciones
- Haga referencia al género de tu historia (fantasía, sci-fi, horror, etc.)
- Use un vocabulario o registro particular
