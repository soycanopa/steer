# UX — Steer (prototipo)

Versión: 0.1  
Complementa: PRD.md, UI.md

## 1. Promesa de uso

Steer se siente como DevTools con un chat que *hace* el cambio. No se siente como Figma, ni como un IDE, ni como un builder tipo Framer.

Frase de cabecera (producto): “Tú diriges. El agente escribe.”

## 2. Principios UX

1. **Señal antes que prompt.** Click, slider, pin. El teclado del chat es secundario.
2. **Lo que ves es preview, no verdad.** Un chip persistente “Preview — sin escribir a disco” mientras haya overrides.
3. **Alcance visible siempre.** Instancia vs componente, nunca implícito.
4. **Aplicar es un acto.** Los tweaks no se van solos al agente. El usuario revisa el lote y dispara.
5. **El agente no desaparece el contexto.** Cada Intent queda como bloque en el transcript, no se aplana a prosa.
6. **Un solo objeto de atención.** Una selección. Un chat. En P0, un preview. En P2 **Vistas**, tres previews de la misma ruta (1440 / 768 / 390) y sigue habiendo una sola selección — el stage activo. No es un canvas de diseño.
7. **Errores accionables.** “No hay `data-tsd-source`” + cómo activarlo. Nunca “algo falló”.
8. **Teclado de builder.** Inspect, aplicar, abortar, focus chat. Sin atajos de editor de código.

## 3. Información architecture

Tres zonas fijas. No layouts alternativos en P0.

```
┌──────────────────────────────────────────────────────────────────┐
│ Titlebar: proyecto · ruta · estado dev · estado agente           │
├───────────────────────────────┬──────────┬───────────────────────┤
│                               │Inspector │ Chat                  │
│   Preview                     │ selección│  intents + stream     │
│   (iframe + overlay)          │ alcance  │  + composer           │
│                               │ tweaks   │                       │
│                               │ pins     │                       │
├───────────────────────────────┴──────────┴───────────────────────┤
│ Status: inspect on/off · N intents en cola · modelo              │
└──────────────────────────────────────────────────────────────────┘
```

El chat es columna propia, no parte del inspector. El Inspector solo
aparece con un nodo seleccionado; sin selección el preview se estira y
el chat permanece. Anchos fijos para inspector (~300px) y chat
(~320px); el preview toma el resto. El drag de splits no es P0.

## 4. Modos

| Modo | Qué hace el pointer en el preview | Cómo se entra |
| --- | --- | --- |
| Interact | Click = usar la app (links, botones reales) | Default |
| Inspect | Click = seleccionar nodo | Toggle `I` o botón cruz |
| Comment | Click = seleccionar + focus textarea pin | `C` con selección, o botón pin |

No hay modo “draw”. No hay modo “pan canvas”.

P2 **Vistas** (no prototipo): el pointer sigue siendo Interact / Inspect / Comment, pero sobre el stage activo de un tablero con 3 iframes de la misma ruta. Spec: [VISTAS.md](./VISTAS.md). El toggle es Vista única | Vistas, no un modo de dibujo.

Al estar Inspect ON, los clicks no deben disparar la app. El bridge hace `preventDefault` + `stopPropagation` en click/mousedown.

## 5. Flujos

### 5.1 Primera apertura (empty)

Pantalla completa, no el layout de tres zonas.

- Logo + “Steer”
- Dos acciones primarias: **Abrir proyecto** / **Crear proyecto TanStack Start**
- Lista “Recientes” si hay prefs
- Texto corto: “El código se queda en tu disco. Steer no es el editor.”

Crear proyecto: diálogo nativo de carpeta padre + input nombre. Steer corre `npx @tanstack/cli@latest create <name> --add-ons …` con Tailwind + devtools si el CLI lo permite; si no, create default y CTA posterior para Devtools.

Errores: carpeta no vacía, CLI no instalado, network al crear. Mensaje + log.

### 5.2 Abrir proyecto existente

1. Folder picker nativo.
2. Splash de detección (1–2s): package manager, Start?, Devtools?, puerto.
3. Si no hay `dev` script → error bloqueante.
4. Si no hay Devtools → entra igual, banner no bloqueante en inspector.
5. Arranca o reusa dev server → proxy → preview `steer:ready`.

Si el preview tarda > 8s: estado “esperando Vite” con stdout tail (últimas 8 líneas). Timeout 30s → acción Reintentar / Abrir en browser.

### 5.3 Seleccionar

1. `I` ON. Hover: outline 2px + label flotante `Hero.tsx:42`.
2. Click: outline sólido, panel inspector se llena.
3. Breadcrumb clickeable. Click en “Hero” sube la selección al host del componente si hay `data-tsd-source` distinto en ancestro.
4. Toggle alcance: `Esta instancia` / `Componente`. Default instancia.
5. Esc o click vacío: deselecciona, no apaga Inspect.

### 5.4 Tweak

Con selección:

- Sliders / inputs del UI.md.
- Cada cambio: `steer:set-overrides` inmediato + push/replace en cola (`kind: tweak`, mismo `prop` se reemplaza, no se apila).
- Chip en status: “3 cambios en preview”.
- El chat *aún no* habla con el agente.

Deshacer tweak: botón reset por fila o `⌘Z` solo sobre overrides (stack local, no el agente).

### 5.5 Comentar

1. Con selección, `C` o botón “Pin”.
2. Aparece pin numerado (#1, #2…) en el nodo y un campo en inspector.
3. Enter envía el pin a la cola. Shift+Enter = nueva línea.
4. Pin vacío no se encola.
5. Borrar pin quita el Intent `comment` y el badge.

### 5.6 Aplicar

Botón primario en inspector y atajo `⌘Enter`.

Estados:

- Disabled si cola vacía o si la selección activa no tiene `source.file`.
- Confirmación no modal: el composer del chat muestra el lote ya formateado. Segundo `⌘Enter` o click “Enviar al agente” dispara.
- Alternativa más rápida (default P0): un solo `⌘Enter` envía. El lote aparece en el transcript a la vez.

Mientras corre:

- Preview sigue interactivo.
- Overrides se quedan hasta `done`.
- Composer locked. Abort visible (`Esc` o botón).
- Nuevos tweaks se pueden encolar para el *siguiente* turno, no se mezclan con el actual.

Al `done`:

- `steer:clear-overrides`.
- HMR debería pintar el resultado. Si en 2s el computed no se acerca al `to`, toast suave “el agente terminó; el preview no refleja el tweak — revisa el diff”.
- Intents del turno quedan como bloques colapsables en el chat.

### 5.7 Chat libre

El composer acepta texto. Si hay cola de intents y el usuario escribe, el texto viaja como `userNote` del `ApplyPayload`. Si no hay cola, `TurnInput.kind = free`.

No slash-commands en P0 salvo los que OpenCode ya entienda si el usuario los escribe literal.

### 5.8 Modelo

Popover en el header del chat:

- Provider (los `connected` primero)
- Modelo
- Reasoning: Off / Low / Medium / High
- Hint si `supportsReasoning === false`

Cambiar modelo **dentro del mismo AgentPort** no reinicia sesión (el adapter acepta model per message). Cambiar de proveedor abre una conversación local nueva; el próximo turno manda `sessionId` null. Si falla, mensaje “este turno usó el default del server”.

### 5.9 Perder el preview

Navigate dentro del iframe: el bridge manda `steer:navigate`. Steer actualiza el chip de ruta. El overlay CSS del documento anterior muere con el iframe. Selección se limpia. Cola de intents y drafts (tweaks y comentarios) *se conservan* hasta Apply; al recargar el preview se rehidratan si el nodo sigue en el árbol.

Reload manual: botón en titlebar.

## 6. Estados vacíos y de error

| Estado | UI | Acción |
| --- | --- | --- |
| Sin proyecto | Empty screen | Abrir / Crear |
| Arrancando dev | Preview skeleton + log | Cancelar |
| Preview down | Panel oscuro + error | Reintentar |
| Inspect sin source maps | Banner amber en inspector | Copiar snippet Devtools |
| Sin selección | Inspector ilustración corta “Pulsa I y haz click” | — |
| Cola vacía | Botón Aplicar disabled | — |
| OpenCode down | Banner en chat | “Arrancar opencode serve” |
| Turno error | Bloque rojo en transcript | Reenviar lote |
| Permiso agente (P1) | Card inline accept/deny | — |

## 7. Teclado

| Tecla | Acción |
| --- | --- |
| `I` | Toggle Inspect (si focus no está en input) |
| `C` | Pin sobre selección |
| `Esc` | Deseleccionar; si streaming, no aborta (abort es explícito) |
| `⌘Enter` | Aplicar lote / enviar composer |
| `⌘.` | Toggle debug payload |
| `⌘O` | Abrir proyecto |
| `⌘L` | Focus composer |
| `⌘Z` | Undo último override local |

No interceptar atajos del iframe cuando Interact ON, salvo los globales de ventana (`⌘O`, `⌘L`).

## 8. Copy (tono)

Segunda persona, frases cortas, español. Técnico cuando toca (`data-tsd-source`, HMR). Evitar “mágico”, “genial”, “AI-powered”.

Ejemplos:

- “Preview. Aún no está en el repo.”
- “Sin source map. Instala TanStack Devtools Vite para anclar el nodo.”
- “3 intents listos. El agente va a escribir el archivo.”
- “OpenCode no responde en :4096.”

## 9. Accesibilidad P0

- Focus ring visible en panel y composer.
- Pins y outline no son la única señal: el inspector repite archivo:línea.
- Sliders con input numérico al lado.
- No depender del hover para seleccionar: Inspect + click basta.
- Contrast sobre overlay: outline usa color que no sea el brand del proyecto (azul Steer, no “auto”).

WCAG completo no es meta del prototipo. No construir un modo daltónico custom.

## 10. Lo que no debe sentirse

- Un Design tool con artboards.
- Un IDE con tabs de archivos.
- Un chat flotante tipo Intercom.
- Un “genera la página entera con un prompt” como home.

Si un flujo nuevo pide una cuarta columna o un canvas zoom, está fuera de P0.
