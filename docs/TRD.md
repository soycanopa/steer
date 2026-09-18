# TRD — Steer (prototipo)

Versión: 0.2  
Complementa: PRD.md, ARCHITECTURE.md, IMPLEMENTATION.md, AGENTS.md

## 1. Objetivo técnico

Probar el loop **preview real → Intent → agente → source → HMR** en un repo TanStack Start, con OpenCode como primer adapter, sin que la UI persista código.

## 2. Stack

Steer **no se desarrolla “en Rust”**. Se desarrolla en paquetes TypeScript. Rust es el host.

| Capa | Tecnología | Notas |
| --- | --- | --- |
| Host OS | Tauri 2 / Rust | Ventana, fs, spawn, proxy. Cero domain |
| UI | `packages/ui` React 19 + Tailwind v4 | Componentes tontos. Cero fetch a agentes |
| Estado | `packages/app-state` Zustand | Único orquestador de puertos |
| Domain | `packages/domain` TS puro | Intent, cola, serializer |
| Contratos | `packages/ports` | `AgentPort`, `ProjectPort`, `PreviewPort` |
| Agente P0 | `packages/agent-opencode` | `opencode serve` :4096 HTTP+SSE |
| Agentes P1+ | `packages/agent-*` | Cursor, Grok, Claude. Mismo `AgentPort`. UI no cambia |
| Preview | `packages/preview-bridge` | `steer:*` + overlay |
| Proyecto objetivo | TanStack Start | `data-tsd-source` vía Devtools Vite |
| Persistencia | prefs vía host | last path, providerId, modelRef |

Node LTS. pnpm workspaces. Detalle de imports y composition: **ARCHITECTURE.md**.

## 3. Arquitectura

Ver diagrama y matriz de imports en ARCHITECTURE.md. Resumen operativo:

- UI → app-state → ports ← adapters
- OpenCode no es una columna del producto; es un plugin que implementa `AgentPort`
- El iframe no habla con ningún provider
- El adapter no conoce sliders; recibe `TurnRequest` con `TurnPart` intents/text/image
- Stdio, si algún CLI futuro lo exige, vive *dentro* de ese adapter — nunca en React ni en domain
- Rust no conoce `Intent`

## 4. Process model

### 4.1 Dev server del proyecto

Tauri command `project_dev_start { path }`:

1. Leer `package.json`.
2. Detectar package manager (`pnpm-lock.yaml` > `package-lock.json` > `yarn.lock` > `bun.lockb`).
3. Detectar script `dev`.
4. Si el puerto esperado ya responde 200, reutilizar.
5. Si no, spawn en `path` con cwd = proyecto. Capturar stdout para extraer URL (`Local: http://localhost:3000`).
6. Health-check hasta timeout 30s.

Command `project_dev_stop` mata el child si Steer lo arrancó. No mata un dev server que ya existía.

### 4.2 OpenCode server

Command `opencode_ensure { directory }`:

1. `GET http://127.0.0.1:4096/global/health`.
2. Si healthy, usar. Scope de directorio: query `directory` o header `X-Opencode-Directory`.
3. Si no, spawn `opencode serve --port 4096 --hostname 127.0.0.1 --cors <origen-tauri>`.
4. Esperar health.

El renderer nunca llama `opencode` por CLI para chats.

## 5. Contrato Intent

Fuente de verdad del prototipo. Cualquier UI que no pueda emitir uno de estos tipos no se construye.

```ts
export type SourceLoc = {
  file: string;       // posix relativo al root del proyecto
  line: number;       // 1-based
  col: number;        // 1-based
};

export type Scope = "instance" | "component";

export type Selection = {
  source: SourceLoc;
  component: string | null;     // nombre React si se puede inferir
  route: string | null;         // pathname Start
  tag: string;                  // h1, button, section
  textPreview: string;          // copy del nodo; el bridge recorta a 4k
  computed: Record<string, string>;
  breadcrumb: string[];         // ["Hero", "h1"]
};

export type TweakProp =
  | "fontSize"
  | "fontWeight"
  | "lineHeight"
  | "letterSpacing"
  | "color"
  | "backgroundColor"
  | "textAlign"
  | "width"
  | "height"
  | "padding"
  | "margin"
  | "gap"
  | "flexDirection"
  | "flexWrap"
  | "justifyContent"
  | "alignItems"
  | "maxWidth"
  | "objectFit"
  | "fontStyle"
  | "textDecoration"
  | "borderRadius"
  | "opacity"
  | "text";              // copy del nodo; overlay via textContent, no CSS

export type Intent =
  | {
      id: string;
      kind: "select";
      at: number;
      selection: Selection;
      scope: Scope;
    }
  | {
      id: string;
      kind: "comment";
      at: number;
      selection: Selection;
      scope: Scope;
      pin: number;
      body: string;
    }
  | {
      id: string;
      kind: "tweak";
      at: number;
      selection: Selection;
      scope: Scope;
      prop: TweakProp;
      from: string;
      to: string;
    }
  | {
      id: string;
      kind: "screenshot";
      at: number;
      selection: Selection | null;
      mime: "image/png";
      dataBase64: string;
    };

export type ApplyPayload = {
  projectRoot: string;
  route: string | null;
  intents: Intent[];
  userNote?: string;
};
```

IDs: `crypto.randomUUID()`. `at`: `Date.now()`.

Cola: Zustand `intentQueue: Intent[]`. “Aplicar” no vacía hasta `agent.turn.completed` con éxito; entonces `committedIntents` pasa al transcript y la cola se limpia.

## 6. Inspect bridge (iframe ↔ parent)

Steer inyecta un script de bridge en el preview de una de estas formas (P0: la más simple que funcione):

**Opción A (preferida en prototipo):** el usuario añade `@steer/inspect` como dep de dev del proyecto objetivo. Un plugin Vite inyecta el bridge. Más limpio, más trabajo de onboarding.

**Opción B (aceptable en P0):** el parent no puede inyectar JS cross-origin. Por eso el preview debe servirse de forma que el bridge viva *dentro* del proyecto o se use un proxy local.

Decisión P0: **proxy local Tauri + inyección**.

1. El iframe no carga `http://localhost:3000` directo.
2. Carga `steer-preview://` o `http://127.0.0.1:<steer-proxy>/` que reverse-proxea el dev server.
3. El proxy inserta `<script src="/__steer/bridge.js">` antes de `</body>` en documentos HTML.
4. `bridge.js` corre en el origin del proxy, mismo mundo que el DOM de la app.

Si el proxy se atrasa, fallback documentado: pedir al usuario el plugin Vite `@steer/inspect` (P1). No bloquear el diseño del resto.

### 6.1 Mensajes

Parent → iframe

```ts
type ParentToFrame =
  | { type: "steer:inspect-on" }
  | { type: "steer:inspect-off" }
  | { type: "steer:set-overrides"; overrides: OverlayOverride[] }
  | { type: "steer:clear-overrides" }
  | { type: "steer:highlight"; source: SourceLoc | null }
  // Pins (Fase E): badge numerado anclado al nodo data-steer-id.
  | { type: "steer:add-pin"; intentId: string; steerId: string; number: number; body?: string; kind?: "comment" | "edit" }
  | { type: "steer:remove-pin"; intentId: string }
  | { type: "steer:clear-pins" }
  // Capas (Fase layers): seleccionar un nodo desde el árbol.
  | { type: "steer:select-node"; id: string }
  | { type: "steer:select-source"; source: SourceLoc }
  | { type: "steer:select-ancestor" }
  // Cámara: selección de área (click = viewport completo) y captura silenciosa.
  | { type: "steer:capture" }
  | { type: "steer:capture-thumbnail" };
```

iframe → parent

```ts
type FrameToParent =
  | { type: "steer:ready" }
  | { type: "steer:hover"; selection: Selection | null }
  // id = data-steer-id que el bridge asignó al nodo clickeado (Fase D);
  // el parent lo necesita para direccionar los overrides al nodo exacto.
  | { type: "steer:select"; id: string; selection: Selection }
  | { type: "steer:navigate"; href: string }
  // Árbol de capas: push en ready/navigate y con debounce al mutar DOM.
  | { type: "steer:tree"; nodes: LayerNode[] }
  // Capturas (Cámara).
  | { type: "steer:captured"; mime: string; dataUrl: string }
  | { type: "steer:capture-error"; message: string }
  /** Thumbnail del preview activo para el home. */
  | { type: "steer:thumbnail"; dataUrl: string }
  | { type: "steer:open-inspector" };
```

`Selection` se construye así:

```
el.closest("[data-tsd-source]") || el
attr = el.getAttribute("data-tsd-source") // "src/components/Hero.tsx:42:6"
computed = getComputedStyle(el) para las TweakProp
```

Si no hay `data-tsd-source` en el nodo ni ancestro: emitir `selection.source.file = ""` y el panel muestra CTA “activa TanStack Devtools source injection”. No inventar paths.

### 6.2 Overlay CSS

El bridge mantiene un `<style data-steer-overlay>`:

```css
[data-steer-id="abc"] {
  font-size: 40px !important;
  text-align: center !important;
}
```

Asigna `data-steer-id` al nodo seleccionado. Nunca escribe al filesystem. `clear-overrides` elimina el style y los attrs.

Selector por scope (Fase D): scope `instance` → `[data-steer-id]`; scope `component` → `[data-tsd-source="<file>:<line>:<col>"]` (así el override pinta todas las instancias del componente; si no hay source, cae a `data-steer-id`).

`prop: "text"` no entra al `<style>`: el bridge guarda el `textContent` original y lo reemplaza en el nodo (restore en reset/clear). El overlay sigue siendo efímero; el source lo escribe el agente en Apply.

## 7. Serialización a prompt

El adapter no manda JSON crudo al modelo como único contenido. Manda texto determinista + JSON adjunto para que el agente no “poeticée” el target.

Plantilla P0 (español, el usuario trabaja en ES; el bloque técnico en EN):

```
El usuario dirigió la UI. NO adivines el nodo. USA las rutas y líneas.

Reglas:
- Escribe solo source del repo. No dejes overrides ni <style> inyectado.
- Prefiere tokens del theme / escala Tailwind / CVA variants sobre px crudos.
- Respeta scope: instance = este uso; component = el componente.
- No refactorices fuera de los targets.
- No commitees.

INTENTS_JSON
{...ApplyPayload...}

Resumen humano:
- [tweak] Hero.tsx:42 fontSize 32px → 40px (scope: instance)
- [tweak] Hero.tsx:42 textAlign left → center (scope: instance)
- [comment #1] Hero.tsx:42 “Más display, menos UI copy.”
```

`domain.serializeTurn` produce ese texto. El adapter OpenCode lo manda como part. Otro adapter puede envolverlo con su system propio; no reescribe Intent.

Además, `domain.TURN_GUIDELINES` viaja como primera parte de texto de **todo** turno (también los de texto puro, sin intents): tareas (todo) vivas — in_progress/completed al avanzar —, respuesta en markdown con párrafos cortos, reporte por pasos tras cada herramienta, y conservar la inspección (`@tanstack/devtools-vite` / `devtools()` en vite config, sin spread `{...props}` en JSX). `app-state` la antepone al armar `TurnRequest.parts`; los adapters solo la unen con el resto.

## 8. Adapter OpenCode (`packages/agent-opencode`)

Implementa `AgentPort` (ARCHITECTURE.md §4). La UI no importa este package.

`startTurn` por dentro:

- `ensureRuntime` → health o spawn via `ProcessPort`
- `POST /session` si no hay `sessionId`
- `POST /session/:id/prompt_async` con el texto serializado + extras mapeados
- SSE → `AgentEvent`. El evento de bus `todo.updated` y el input del tool part `todowrite` se mapean a `AgentEvent` `todo` (snapshot normalizado con `domain.parseTodos`)
- `extras.reasoning.effort` se envía si el schema del server lo acepta; si no, se anexa al texto y `capabilities.reasoning` queda honest

Endpoints que **solo este adapter** conoce:

| Uso | Método |
| --- | --- |
| Health | `GET /global/health` |
| Providers / models | `GET /config/providers` |
| Crear sesión | `POST /session` body `{ title }` + `directory` |
| Enviar | `POST /session/:id/prompt_async` |
| Eventos | `GET /event` o `GET /global/event` SSE |
| Abort | `POST /session/:id/abort` (si hay id; el adapter siempre aborta el SSE local) |
| Diff (P1) | `GET /session/:id/diff` |
| Permiso (P0) | `POST /session/:id/permissions/:permissionID` body `{ response: "once" \| "always" \| "reject" }` (`always` si política Always approved) |

Lista de modelos: siempre `GET /config/providers` mapeado a `ModelRef[]`. Nunca hardcodear. El chat solo ve `AgentPort.listModels()`.

## 8.1 Adapter Cursor (`packages/agent-cursor`)

Implementa el mismo `AgentPort`. El SDK `@cursor/sdk` es Node (runtime local contra `cwd` del proyecto abierto). El webview Tauri no lo carga: el host spawnea `packages/agent-cursor/src/serve.mjs` y el adapter habla HTTP+SSE con ese sidecar.

- Runtime: **local** (`local.cwd` = `TurnRequest.directory`). Cloud Agents clonan un repo en una VM; eso no escribe el proyecto abierto.
- Modelos: `Cursor.models.list()` vía `GET /v1/models`. Nunca hardcodear ids.
- Auth: `CURSOR_API_KEY` si existe; si no, `Cursor.auth.status()` / `Cursor.auth.login()` (store en `~/.cursor/sdk/auth.json`). **No** lee la sesión de Cursor.app: el SDK no comparte ese login. Si la app está instalada y Steer no está autorizado, el sidecar abre el navegador una vez.
- `adapterId` del `ModelRef` = `"cursor"`. `app-state` elige el `AgentPort` por `adapterId`.
- Knobs del catálogo (`fast`, `optimize_for`, …) van en `capabilities.params` y en `extras.params`. No se fingen como reasoning OpenCode.

## 8.2 Adapter Grok Build (`packages/agent-grok`)

Implementa el mismo `AgentPort`. El CLI `grok` habla ACP por stdio (`grok agent stdio`); el webview Tauri no lo carga. El host spawnea `packages/agent-grok/src/serve.mjs` y el adapter habla HTTP+SSE con ese sidecar.

- Runtime: **local** (`--cwd` / ACP `session/new` = `TurnRequest.directory`).
- Modelos: stdout de `grok models` vía `GET /v1/models`. Nunca hardcodear ids.
- Auth: `XAI_API_KEY` si existe; si no, la sesión de `grok login`. **No** lee tokens de Grok Bot.app.
- `adapterId` del `ModelRef` = `"grok"`. `app-state` elige el `AgentPort` por `adapterId`.
- Effort del CLI (`--effort`) se mapea desde `extras.reasoning.effort` (`low` / `high` / `max`).
- Transcript **Razonamiento** = `session/update` thought ACP (`agent_thought_chunk`, ContentBlock anidado) → `reasoning-delta`. No se sintetiza desde tools ni usage.
- El sidecar es el **cliente ACP**: responde las requests que el agente le delega — `fs/read_text_file` (tope 256 KB, soporta `line`/`limit`), `fs/write_text_file`, `session/request_permission` (auto-allow; el CLI corre con `--always-approve`) — y responde `-32601` a lo no implementado. Sin respuesta el agente bloquea hasta el timeout del turno; nunca descartar una request entrante. El nombre real del tool puede viajar en `rawInput.type` (`{"type":"ListDir",…}`).

## 8.3 Adapter Antigravity (`packages/agent-antigravity`)

Implementa el mismo `AgentPort`. El CLI `agy` habla headless NDJSON (`--input-format stream-json` / `--output-format stream-json`). El host spawnea `packages/agent-antigravity/src/serve.mjs` y el adapter habla HTTP+SSE.

- Runtime: **local**. El CLI **ignora** el `cwd` del proceso (cae a `~/.gemini/antigravity-cli/scratch`). Steer pasa `--add-dir` con `TurnRequest.directory` y rechaza el `init` si `init.cwd` no es ese proyecto.
- El adapter envuelve el prompt con `PROJECT_ROOT` (Steer ya abrió el repo). No reescribe Intent / `serializeTurn`.
- Modelos: stdout de `agy models`. Nunca hardcodear ids.
- Auth: sesión de `agy` / token CLI, o `GEMINI_API_KEY`. **No** lee el keyring de Antigravity.app.
- `adapterId` = `"antigravity"`. El effort va en el id del modelo (`-high` / `-medium` / Thinking); el **picker** de Reasoning no se muestra.
- El desplegable **Razonamiento** del chat es transcript (`AgentEvent` `reasoning-delta`) y vale para **cualquier** AgentPort (OpenCode, Cursor, Grok, Antigravity). No se inventa texto a partir de `usage.thinking_tokens`.
- Claude Code y Codex quedan pendientes.

## 8.4 Lista de tareas del agente (evento `todo`)

Todos los adapters pueden emitir `AgentEvent` `{ type: "todo", todos: AgentTodo[] }`: snapshot completo de las tareas que el agente-producto publica durante el turno.

- Contrato: `AgentTodo` / `parseTodos` / `replaceTodos` viven en `packages/domain/src/todos.ts`. Los estados crudos del provider se normalizan (`done` → `completed`, `active` → `in_progress`, desconocido → `pending`).
- OpenCode: evento de bus `todo.updated` (filtrado por sesión) + fallback al `state.input` del tool part `todowrite`.
- Cursor / Grok / Antigravity: tool calls cuyo nombre normalizado es `todowrite`, `todoupdate`, `writetodos`, `updatetodos`, `updateplan` o `setplan` (`domain.isTodoTool`); los args (`todos: [{content, status}]`, `plan: string[]`) se parsean con `parseTodos`. El evento genérico `tool` se sigue emitiendo.
- app-state: `ChatSession.todos` guarda el snapshot (reemplazo, ids estables por contenido). En `done` / error / abort se limpia: el panel de tareas solo vive durante el turno.
- UI: `packages/ui/src/TodoPanel.tsx`, colapsable sobre el composer (mismo slot que `QuestionCard`). Genérico: ningún import de adapters, ningún nombre de provider.

## 9. Commands Tauri (P0)

```
project_open            { path } -> ProjectMeta
project_create_start    { parentDir, name } -> ProjectMeta
project_dev_start       { path } -> { url, spawned: boolean }
project_dev_stop        { path }
project_preview_url     { path } -> string | null   // home: URL viva sin spawnear
window_snapshot         { x, y, width, height } -> { dataUrl }  // thumbnail nativo
project_read_package    { path } -> PackageJson
opencode_ensure         { directory } -> { baseUrl, version }
cursor_ensure           {} -> { baseUrl, version, spawned }
grok_ensure             {} -> { baseUrl, version, spawned }
antigravity_ensure      {} -> { baseUrl, version, spawned }
proxy_start             { upstreamUrl } -> { proxyUrl }
proxy_stop              {}
```

`ProjectMeta`:

```ts
type ProjectMeta = {
  root: string;
  name: string;
  packageManager: "pnpm" | "npm" | "yarn" | "bun";
  hasDevtoolsVite: boolean;
  frameworkGuess: "tanstack-start" | "unknown";
};
```

Heurística Start: dependencia `@tanstack/react-start` o `@tanstack/start-client` o archivo `vite.config.*` + `src/routes`.

Capabilities Tauri 2: fs scope al diálogo de carpeta que el usuario eligió; shell scope a `pnpm`/`npm`/`yarn`/`bun`/`opencode`/`npx`. Nada de fs home entero.

## 10. Estado (`packages/app-state`)

Slices. Hablan con puertos, no con OpenCode ni con Tauri directo.

- `project` → `ProjectPort`
- `preview` → `PreviewPort`
- `intents` → funciones puras de `domain`
- `agent` → `AgentPort` seleccionado por `adapterId` (sessionId, model, extras, transcript). Mismo adapter reutiliza `sessionId`; otro adapter = sesión nueva.
- `prefs`: lastProject, lastProviderId, lastModelRef

Composition root inyecta los ports. No React Context para esto.

## 11. Onboarding técnico del proyecto objetivo

Para que Inspect funcione, el repo debe tener source injection. Checklist al abrir:

1. ¿Es Start o al menos Vite + React? Si unknown, warning no bloqueante.
2. ¿Existe `@tanstack/devtools-vite` y `injectSource.enabled` (default true)?
3. Si falta, CTA: instalar plugin. Snippet en UI, no auto-editar `vite.config` en P0 (eso ya sería “la UI escribe source”). Opcional P1: pedirle al agente que lo instale.

Sin `data-tsd-source`, selección visual sí, apply al agente con selector CSS + texto + screenshot (P1). En P0 se bloquea Apply con mensaje claro.

## 12. Seguridad

- Preview proxied. El bridge solo acepta `event.source === parent`.
- OpenCode en loopback. CORS explícito al origin de Tauri.
- No enviar el repo a un cloud de Steer. No hay backend propio en P0.
- Screenshots (P1) no salen de la máquina salvo como part del mensaje a OpenCode local.
- Capabilities mínimas. Sin `shell` abierto irrestricto.

## 13. Performance

- Hover: no flood. Throttle 32 ms hacia el parent.
- Overrides: un solo stylesheet, no N style tags.
- SSE: una conexión por sesión activa.
- Iframe: no remount al tweakear; solo postMessage.
- El canvas infinito queda fuera: un iframe, transform none.

## 14. Testing

P0 mínimo:

- Unit: parser de `data-tsd-source`, serializer de prompt, reducer de overrides.
- Integration (sin red): mock adapter + apply limpia overrides.
- Manual: repo Start example `start-basic` con Devtools. Flujo feliz del PRD §9.

No E2E Playwright del iframe en la primera semana si frena el loop.

## 15. Observabilidad

Console namespaced `steer:project`, `steer:bridge`, `steer:agent`. En UI, un panel “Debug” oculto detrás de `⌘.` que muestra el último `ApplyPayload` y el último event SSE. Imprescindible para construir, no es feature de usuario.

## 16. Decisiones explícitas

| Tema | Decisión |
| --- | --- |
| ¿Se desarrolla en Rust? | No el producto. Rust = host OS. Ver ARCHITECTURE.md |
| ¿Web first? | No. Tauri host desde commit 1. Domain/UI son TS. |
| ¿Stdio desde React? | No. Si un CLI futuro es stdio, el adapter lo encapsula. |
| ¿UI escribe Tailwind? | No. |
| ¿UI importa agent-opencode? | No. Solo composition root. |
| ¿Multi-preview? | No en P0. |
| ¿Nombre del paquete inspect? | `@steer/preview-bridge` |
| ¿Idioma de prompts al agente? | Plantilla ES + JSON EN, vive en domain. |
| ¿Windows? | No empaquetar. Dev en macOS / Linux. |
