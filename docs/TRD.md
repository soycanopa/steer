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
| Agentes P1+ | `packages/agent-*` | Mismo `AgentPort`. UI no cambia |
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
  textPreview: string;          // max 80 chars
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
  | "opacity";

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

## 8. Adapter OpenCode (`packages/agent-opencode`)

Implementa `AgentPort` (ARCHITECTURE.md §4). La UI no importa este package.

`startTurn` por dentro:

- `ensureRuntime` → health o spawn via `ProcessPort`
- `POST /session` si no hay `sessionId`
- `POST /session/:id/prompt_async` con el texto serializado + extras mapeados
- SSE → `AgentEvent`
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
- `agent` → `AgentPort` seleccionado por `providerId` (sessionId, model, extras, transcript)
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
