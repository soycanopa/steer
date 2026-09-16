# UI — Steer (prototipo)

Versión: 0.1  
Complementa: UX.md  
Target: ventana desktop ~1440×900, densa, oscura por default.

## 1. Dirección visual

Herramienta de taller, no marketing site. Superficies planas, tipografía una sola familia, acento único, cero ilustraciones decorativas.

Referencia de *densidad*: DevTools + un cliente de agente serio. No Forge pixel-perfect. No shadcn genérico sin criterio: se puede usar primitives, no el look default sin tocar.

## 2. Tokens

```
--bg-0:        #0e0f11        /* ventana */
--bg-1:        #16181c        /* paneles */
--bg-2:        #1e2127        /* inputs, chips */
--bg-3:        #272b33        /* hover */
--line:        #2c313a
--text-0:      #f2f3f5
--text-1:      #c4c8d0
--text-2:      #8b919c
--accent:      #5b8cff        /* selección, primary */
--accent-dim:  #5b8cff33
--ok:          #3dd68c
--warn:        #f5c15d
--danger:      #ff6b6b
--pin:         #ff8a4c
--overlay:     #5b8cff        /* outline inspect */
--radius-s:    6px
--radius-m:    10px
--font-ui:     "IBM Plex Sans", "Inter", ui-sans-serif
--font-mono:   "IBM Plex Mono", ui-monospace
--fs-0:        11px
--fs-1:        12.5px
--fs-2:        13.5px
--fs-3:        15px
```

Tipografía UI pequeña. El preview es el que brilla; Steer se apaga alrededor.

Light mode: no en P0. El preview del usuario sí puede ser claro; el chrome de Steer no cambia.

## 3. Layout chrome

**Titlebar** (altura 40px, traffic lights nativos Tauri `titleBarStyle: overlay` si macOS):

- Izquierda: padding para traffic lights + nombre del proyecto (mono, 12.5)
- Centro: chip de ruta `/` + botón reload preview
- Derecha: pill estado dev (`live` verde / `down` rojo) · pill OpenCode (`4096` / `off`) · avatarless

**Split vertical** con handle de 1px `--line` y hit area 6px.

**Statusbar** 24px: modo (`INSPECT` / `INTERACT`) · `n intents` · modelo corto `anthropic/…` · `⌘Enter aplicar`.

## 4. Preview

Fondo `--bg-0`. El iframe flota con margen 12px y radius `--radius-m`, clip. Barra mini sobre el iframe (28px):

- Toggle Inspect (icono cruz, estado filled cuando ON)
- Toggle Interact
- URL readonly del proxy
- Botón “abrir en browser”

Outline de inspect: 2px solid `--overlay`, offset 0. Label flotante 11px mono sobre fondo `#0e0f11cc`, pegada arriba-izquierda del bounding box.

Pins: círculo 18px `--pin`, número blanco, ancla esquina superior derecha del box. No tapar el contenido si cabe a la derecha.

No device frames. No rulers. No zoom canvas.

## 5. Inspector

Padding 12. Secciones colapsables (default abiertas):

### 5.1 Selección

- Breadcrumb: `Hero / h1` (fs-1, text-1, `/` text-2)
- Path: `src/components/Hero.tsx:42` (mono fs-0, copiable al click)
- Text preview entre comillas, max 2 líneas
- Segmented control alcance:
  - `Instancia`
  - `Componente`

Si no hay selección: ilustración vacía 0. Empty copy del UX.md.

Si no hay source: path muestra `—` y banner warn.

### 5.2 Tweaks

El conjunto de filas **depende del nodo** (`inspectKind`: texto / caja / imagen). No mostrar tipografía en un `div` ni `object-fit` en un `span`.

Una fila por propiedad. Label 11px text-2 + control + valor.

| Prop | Control | Dónde |
| --- | --- | --- |
| Width / Height | slider + input px | caja, imagen; texto si aplica |
| Font size | slider 10–72 + input | texto |
| Weight | segmented 400 / 500 / 600 / 700 | texto |
| Line height / tracking | slider + input | texto |
| Color | swatch + hex input | texto |
| Align | 4 icon buttons L/C/R/J | texto |
| Flex direction | row / column | caja flex |
| Gap | slider 0–64 | caja flex/grid |
| Object-fit | cover / contain / fill | imagen |
| Background | swatch + hex | caja |
| Padding / Margin | box visual (caja) o slider | todos |
| Radius | slider 0–32 | todos |
| Opacity | slider 0–100% | todos |

Fila dirty: dot accent a la izquierda + valor `from → to` en mono.

Botón ghost por fila “reset”. Botón text “Reset preview” al pie de la sección.

### 5.3 Pins

Lista de pins de la selección actual. Textarea 3 filas. Botón `Añadir pin`.

### 5.4 Apply bar

Pegada al fondo del inspector (o al borde con el chat):

- Primary: `Aplicar n intents` (`⌘Enter`)
- Ghost: `Vaciar cola`
- Disabled styles obvios

Primary usa `--accent`. No gradient.

## 6. Chat

Fondo `--bg-1`. Transcript scroll inverso (abajo = último).

Tipos de bloque:

1. **User text** — burbuja `--bg-2`, text-0, radius-m, max-width 100%.
2. **Intent batch** — card con header `3 intents · instancia` y lista:
   - icono tweak / pin
   - `Hero.tsx:42`
   - `fontSize 32px → 40px`
   Mono fs-0. Colapsado muestra solo el header.
3. **Agent text** — sin burbuja, text-1, markdown sobrio (headings fs-3, code `--bg-2`).
4. **Tool** — chip mono `edit Hero.tsx` / `read …` con spinner si start.
5. **Error** — borde `--danger`, texto claro, botón Reenviar.

Composer: textarea auto-grow 1–6 filas, `--bg-2`, placeholder “Añade una nota o deja que hablen los intents”. Botón send icon. A la izquierda, botón modelo (label corto).

Mientras stream: caret block, botón Abort (`Detener`) danger ghost.

## 7. Empty / onboarding screens

Home centrado, max-width 720.

- Fondo: grid de puntos (`.steer-pixel-grid`) que se desvanece de abajo hacia arriba
- Header: “Steer” (fs-2) + botón “Abrir proyecto”
- **Recientes**: grid de cards chicas (min ~168px, aspect 16/10) con **preview live solo al hover** (iframe 5× ≈900px internos, `pointer-events:none`) y **solo el nombre**; en reposo, thumbnail (snapshot nativo) o placeholder. Borde `--line`, activo con `--accent`/45. Botón **eliminar** (basura, en hover) con **confirmación inline**: borra recents + historial de Steer + server; **no toca archivos**
- **Composer central**: textarea auto-grow con prompt; fila inferior = selector de modelo + botón carpeta (popover: nombre del proyecto + ubicación con folder picker) + candado de permisos + enviar. Fondo #141414, borde `--beam-width` (6px, `--border-input` #1F1F1F), sombra `--shadow-input` y **border beam** animado del paquete `border-beam` (`size="md"`, `colorVariant="colorful"`, `strength=0.7`)
- Progreso del scaffold dentro del propio composer

Sin video. Sin carousel.

## 8. Banners

Full width del panel, 32px, icono + texto + action text button.

- Warn (`--warn` texto, fondo `#f5c15d14`)
- Danger
- Info (accent dim)

No toasts para onboarding. Toast solo para “agente terminó y el preview no coincide” (esquina inferior del preview, 3.5s).

## 9. Iconografía

Lucide o Phosphor, 16px stroke 1.75. Un set, no mezclar. No logos de providers más que un dot de color en el popover de modelo.

## 10. Componentes a construir (inventario P0)

```
AppShell
  Titlebar
  SplitPane
  Statusbar
EmptyState
PreviewFrame
  PreviewToolbar
  InspectOverlay (vive en iframe; chrome labels pueden ser sibling)
InspectorPanel
  SelectionCard
  ScopeToggle
  TweakList
  TweakRow
  PinList
  ApplyBar
ChatPanel
  Transcript
  IntentBatchCard
  ToolChip
  Composer
  ModelPopover
Banner
DebugDrawer
```

No design system package externo obligatorio. Si se usa shadcn: Button, Input, Slider, Popover, ScrollArea. Recolorear a los tokens de §2. No dejar violet default.

## 11. Motion

- 120ms ease-out en hover de filas y botones.
- Outline inspect: sin bounce.
- Stream: sin typewriter fake; texto entra con el SSE.
- No page transitions.

## 12. Estados de controles

| Estado | Tratamiento |
| --- | --- |
| Disabled | opacity .4, cursor default |
| Loading | spinner 12px en el botón, label intacto |
| Dirty tweak | dot accent |
| Streaming | composer disabled, abort visible |
| Inspect ON | botón cruz filled accent, statusbar `INSPECT` |

## 13. Capturas de referencia a implementar (no mock extra)

Al construir, estas cinco pantallas son el Definition of Done visual:

1. Empty state
2. Preview live + Inspect hover
3. Inspector con 2 tweaks dirty + 1 pin
4. Chat con Intent batch + stream de tool `edit`
5. Banner “sin data-tsd-source”

Si una pantalla no está en esta lista, no es P0.
