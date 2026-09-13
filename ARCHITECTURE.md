# Arquitectura — Steer

Versión: 0.2  
Pregunta corta: **¿Se desarrolla en Tauri y Rust?**  
Respuesta: **no el producto. Tauri/Rust es el host OS.** El producto vive en TypeScript, por paquetes, con puertos. Un provider nuevo = un adapter nuevo. La UI no se entera.

## 1. Decisión de stack (cerrada para el prototipo)

| Capa | Lenguaje | Rol | Qué NO hace |
| --- | --- | --- | --- |
| `apps/desktop` shell | Rust (Tauri 2) | Ventana, fs acotado, spawn de procesos, proxy del preview | Intent, chat, sliders, OpenCode API, serializar prompts |
| `apps/desktop` renderer | React + TS | Pintar chrome, emitir *comandos de dominio* | `invoke` de negocio, hablar con providers, parsear SSE |
| `packages/domain` | TypeScript puro | Intent, Selection, cola, serializer de prompt, reglas | React, Tauri, fetch, Node fs |
| `packages/ports` | TypeScript puro | Interfaces `AgentPort`, `ProjectPort`, `PreviewPort`, `ProcessPort` | Implementaciones |
| `packages/agent-opencode` | TypeScript | Habla HTTP+SSE con `opencode serve` | UI, Zustand, Tauri |
| `packages/agent-*` (futuro) | TypeScript | Claude Code, Grok Build, ACP genérico, Cursor CLI | UI |
| `packages/preview-bridge` | TS + `bridge.js` | Protocolo `steer:*`, parser `data-tsd-source` | Agentes |
| `packages/ui` | React + TS | Componentes tontos + tokens | Stores, adapters, Tauri |
| `packages/app-state` | Zustand (o equivalente) | Orquesta puertos. Único lugar que importa ports *y* los llama | JSX de pantallas, fetch a OpenCode |

Regla de oro: **las flechas apuntan hacia adentro, al domain.**  
UI → app-state → ports ← adapters ← host Rust.

```
┌──────────────────────────────────────────────────────────┐
│ apps/desktop (Tauri)                                     │
│  Rust: ProcessPort + PreviewProxy + Dialog               │
│  React: monta packages/ui y le inyecta app-state         │
└──────────────────────────┬───────────────────────────────┘
                           │ composition root
                           ▼
┌──────────────────────────────────────────────────────────┐
│ packages/app-state                                       │
│  applyIntents() → agentPort.submitTurn()                 │
│  selectNode()   → previewPort + intentQueue              │
└──────────┬───────────┬──────────────┬────────────────────┘
           │           │              │
           ▼           ▼              ▼
     AgentPort    ProjectPort    PreviewPort     (packages/ports)
           ▲           ▲              ▲
           │           │              │
    agent-opencode  tauri-project  preview-bridge
    agent-claude*   node-project*  (iframe)
    agent-grok*
    agent-acp*
           │
           ▼
    opencode serve / claude / grok  (procesos ajenos)
```

`*` no se implementa en P0. El puerto sí existe desde el día 1.

## 2. Por qué no “todo en Rust”

Steer es un producto de *dirección visual + chat de agente*. El 80% del riesgo está en:

- overlay / inspect / intents
- adapters HTTP distintos por CLI
- UI densa que va a cambiar cada día

Eso en Rust (egui, iced, Dioxus) o Zig nativo retrasa el loop que hay que probar ahora. Tauri está para:

- abrir carpetas
- nacer/matar `pnpm dev` y `opencode serve`
- proxy que inyecta `bridge.js`
- empaquetar un `.app`

Si mañana el host cambia (otro sidecar, un daemon Node, Circulo reusando el mismo domain), `packages/domain` y `packages/agent-opencode` se mudan enteros. Por eso **no se escribe lógica de Intent en `src-tauri`**.

## 3. Módulos y dependencias permitidas

Matriz. Una X es un error de arquitectura.

| Importa ↓ / a → | domain | ports | ui | app-state | agent-* | preview-bridge | tauri / @tauri-apps |
| --- | --- | --- | --- | --- | --- | --- | --- |
| domain | — | no | no | no | no | no | no |
| ports | sí (tipos) | — | no | no | no | no | no |
| ui | solo tipos de lectura | no | — | no | no | no | no |
| app-state | sí | sí | no | — | no (solo el port) | tipos protocol | no |
| agent-opencode | sí | sí | no | no | — | no | no |
| preview-bridge | sí (Selection) | sí | no | no | no | — | no |
| apps/desktop React | no directo | no | sí | sí | factory | no | wrappers finos |
| apps/desktop Rust | no | no | no | no | no | sirve bridge.js | — |

`packages/ui` recibe datos y callbacks. No llama `agentPort`. No conoce OpenCode.

## 4. Puertos (contratos estables)

Estos tipos viven en `packages/ports`. Los adapters los implementan. La UI nunca los implementa.

```ts
// packages/ports/src/agent.ts

export type ProviderId = string; // "opencode" | "claude-code" | "grok-build" | "acp:<name>"
export type SessionId = string;

export type ModelRef = {
  providerId: ProviderId;
  modelId: string;
  label: string;
  capabilities: {
    reasoning: boolean;
    effort: boolean;
    images: boolean;
    tools: boolean;
  };
};

export type TurnRequest = {
  directory: string;
  sessionId: SessionId | null;
  model: ModelRef;
  extras: Record<string, unknown>; // reasoning.effort, temperature… el adapter interpreta
  parts: TurnPart[];
};

export type TurnPart =
  | { type: "intents"; payload: ApplyPayload }
  | { type: "text"; text: string }
  | { type: "image"; mime: "image/png"; dataBase64: string };

export type AgentEvent =
  | { type: "session"; sessionId: SessionId }
  | { type: "text-delta"; text: string }
  | { type: "tool"; name: string; status: "start" | "end"; detail?: string }
  | { type: "permission"; permissionId: string; summary: string }
  | { type: "done" }
  | { type: "error"; message: string };

export type AgentPort = {
  readonly id: ProviderId;
  readonly label: string;
  health(): Promise<{ ok: boolean; version?: string; detail?: string }>;
  listModels(): Promise<ModelRef[]>;
  ensureRuntime?(directory: string): Promise<void>; // spawn serve si aplica
  startTurn(req: TurnRequest): AsyncIterable<AgentEvent>;
  abort(sessionId: SessionId): Promise<void>;
  respondPermission?(sessionId: SessionId, permissionId: string, accept: boolean): Promise<void>;
};
```

```ts
export type ProjectPort = {
  open(path: string): Promise<ProjectMeta>;
  createStart(parentDir: string, name: string): Promise<ProjectMeta>;
  startDev(path: string): Promise<{ url: string; spawned: boolean }>;
  stopDev(path: string): Promise<void>;
};

export type PreviewPort = {
  setInspect(on: boolean): void;
  setOverrides(overrides: OverlayOverride[]): void;
  clearOverrides(): void;
  highlight(source: SourceLoc | null): void;
  addPin(intentId: string, steerId: string, number: number): void;
  removePin(intentId: string): void;
  clearPins(): void;
  subscribe(handler: (msg: FrameToParent) => void): () => void;
};
```

`extras` existe para no inflar el puerto cada vez que un modelo sume un knob. El adapter documenta qué keys entiende. La UI pregunta `model.capabilities` y solo muestra knobs soportados.

## 5. Cómo se suma un provider (P1, diseño P0)

Checklist. Si un paso toca `packages/ui` más allá del `ModelPopover` genérico, el puerto está mal.

1. Crear `packages/agent-<id>/` que implementa `AgentPort`.
2. Registrar el factory en `apps/desktop/src/composition.ts`:

```ts
const agents: AgentPort[] = [
  createOpencodeAgent({ baseUrl: "http://127.0.0.1:4096" }),
  // createClaudeCodeAgent({ ... }),
  // createGrokBuildAgent({ ... }),
];
```

3. `app-state` elige `AgentPort` por `providerId`. El chat no cambia.
4. `serialize-prompt` sigue en `domain`. El adapter puede *envolver* el texto (system propio) pero no redefinir Intent.
5. Si el CLI no tiene HTTP: el adapter encapsula el transporte (incluido stdio **dentro del adapter**, nunca en React). El puerto sigue siendo async iterable de `AgentEvent`.
6. Tests del adapter con server fake. Cero UI.

Providers previstos, en orden, sin implementarlos ahora:

| Orden | Provider | Transporte probable |
| --- | --- | --- |
| P0 | OpenCode | `opencode serve` HTTP+SSE |
| P1 | Grok Build | HTTP / ACP / stdio encapsulado |
| P1 | Claude Code | CLI o SDK, encapsulado |
| P2 | ACP genérico | un adapter `agent-acp` parametrizado |
| P2 | Codex / Gemini CLI | si hablan HTTP o ACP |

No hay “provider SDK de Steer” cloud. Son procesos locales del usuario.

## 6. Composition root

Único archivo que tiene permiso de importar UI + state + adapters + tauri wrappers:

`apps/desktop/src/composition.ts`

Ahí se construye:

- `projectPort` (Tauri invoke)
- `previewPort` (iframe controller)
- `agentPorts` (mapa)
- `createAppStore({ ports })`
- `<App store={store} />`

Cualquier `import` de `@steer/agent-opencode` desde un componente React es un bug.

## 7. Monorepo

pnpm workspaces + TypeScript project references.

```
steer/
├── AGENTS.md
├── docs/                    # estos .md
├── package.json             # workspaces: apps/* packages/*
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── packages/
│   ├── domain/
│   ├── ports/
│   ├── app-state/
│   ├── ui/
│   ├── preview-bridge/
│   └── agent-opencode/
├── apps/
│   └── desktop/             # Tauri + Vite renderer
│       ├── src/             # composition.ts, main.tsx
│       └── src-tauri/
└── fixtures/
    └── start-basic/         # opcional, gitignored o submodule
```

En P0 los paquetes pueden ser folders con `package.json` mínimo (`"name": "@steer/domain"`). No publicar a npm todavía.

Atajo aceptable los primeros 2 días: carpetas `packages/*` sin workspace si frena el scaffold. La **regla de imports** vale igual. El workspace se cierra antes de Fase F (OpenCode), no después.

## 8. Qué vive en Rust, línea por línea

Permitido en `src-tauri`:

- `dialog` open directory
- leer `package.json` / lockfiles (o delegar y solo devolver bytes)
- spawn / kill `pnpm dev`, `npx @tanstack/cli`, `opencode serve`
- reverse proxy + insertar `bridge.js`
- capabilities ACL

Prohibido en `src-tauri`:

- struct `Intent`
- client HTTP de OpenCode (el renderer/adapter TS ya lo hace; Rust no duplica)
- markdown / prompt templates
- lógica de cola replace-by-prop
- CSS overrides

Si un command Tauri empieza a “saber” qué es un tweak, se está filtrando el domain. Parar.

## 9. Estado

`app-state` tiene slices. Cada slice habla con un puerto, no con una implementación.

- `projectSlice` → `ProjectPort`
- `previewSlice` → `PreviewPort`
- `intentSlice` → solo `domain` (cola pura)
- `agentSlice` → `AgentPort` seleccionado

UI se suscribe. UI dispara actions (`inspectOn()`, `enqueueTweak()`, `apply()`). `apply()` es:

```
payload = domain.buildApplyPayload(queue, projectRoot)
prompt  = domain.serializeTurn(payload, userNote)
for await (ev of agentPort.startTurn({ parts: [{type:'intents', payload}, {type:'text', text: userNote}] }))
  transcript.push(ev)
if ev.done: previewPort.clearOverrides()
```

Ese flujo no se reescribe por provider.

## 10. Tests por módulo

| Paquete | Test |
| --- | --- |
| domain | parser source-loc, reducer de cola, snapshot del prompt |
| ports | no hay runtime; son tipos |
| agent-opencode | mock HTTP/SSE → AgentEvent |
| preview-bridge | parse attr, build Selection |
| app-state | apply + mock AgentPort, asserts clearOverrides |
| ui | opcional; no bloquea P0 |
| rust | health spawn en integration manual |

Un test de UI que instancie `OpencodeAgent` es un test mal puesto.

## 11. Respuesta operativa para el que se sienta a codear

- ¿Desarrollo en Rust? Solo el host. Casi todo el día estás en TypeScript.
- ¿Desarrollo en React? Solo `packages/ui` y el composition root.
- ¿Dónde pongo un provider nuevo? `packages/agent-<id>` implementando `AgentPort`.
- ¿Dónde pongo un slider nuevo? `domain` (TweakProp) + `ui` (fila) + overlay en `preview-bridge`. Cero agentes.
- ¿Puedo llamar `fetch('http://127.0.0.1:4096')` desde un componente? No.
