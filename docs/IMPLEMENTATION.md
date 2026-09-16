# Implementación — Steer (prototipo)

Versión: 0.1  
Leer antes: PRD, TRD, UX, UI, AGENTS.md

## 0. Meta de esta fase

Un binario Tauri que abre un repo Start, inspecciona un nodo, encola tweaks + un pin y lo aplica con OpenCode. Nada más.

Tiempo objetivo si se construye con foco: **10–15 sesiones de trabajo**, no un trimestre. Si una tarea no empuja el flujo feliz del PRD §9, no es de esta fase.

## 1. Crear el repo

Monorepo desde el inicio. No un Vite plano con todo en `src/`.

```bash
mkdir steer && cd steer
pnpm init
# pnpm-workspace.yaml → packages/*  apps/*

pnpm create tauri-app@latest apps/desktop -- --template react-ts
```

Workspaces:

```
packages/*:
  domain, ports, app-state, ui, preview-bridge, agent-opencode
apps/*:
  desktop
```

Cada package: `package.json` name `@steer/<id>`, `"type": "module"`, tsconfig que extiende `tsconfig.base.json`.

`apps/desktop` depende de `@steer/ui` y `@steer/app-state`.  
`app-state` depende de `@steer/domain` y `@steer/ports`.  
`agent-opencode` depende de `@steer/ports` + `@steer/domain`.  
`ui` depende de `@steer/domain` (solo tipos).

Tauri `identifier`: `app.steer.dev`. Overlay titlebar. Capabilities acotadas (TRD §9).

Docs a `docs/`. `AGENTS.md` + `ARCHITECTURE.md` en la **raíz**.

## 2. Árbol objetivo

```
steer/
├── AGENTS.md
├── ARCHITECTURE.md
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── docs/                      # PRD TRD UX UI IMPLEMENTATION
├── packages/
│   ├── domain/src/
│   │   ├── intent.ts
│   │   ├── source-loc.ts
│   │   ├── queue.ts           # replace-by-prop
│   │   └── serialize-turn.ts
│   ├── ports/src/
│   │   ├── agent.ts           # AgentPort
│   │   ├── project.ts
│   │   └── preview.ts
│   ├── app-state/src/
│   │   ├── store.ts
│   │   ├── project.ts
│   │   ├── preview.ts
│   │   ├── intents.ts
│   │   └── agent.ts
│   ├── ui/src/
│   │   ├── AppShell.tsx
│   │   ├── EmptyState.tsx
│   │   ├── PreviewFrame.tsx
│   │   ├── InspectorPanel.tsx
│   │   ├── ChatPanel.tsx
│   │   └── debug/DebugDrawer.tsx
│   ├── preview-bridge/src/
│   │   ├── protocol.ts
│   │   └── bridge.js
│   └── agent-opencode/src/
│       ├── client.ts          # HTTP + SSE → AgentEvent
│       └── map-models.ts
├── apps/desktop/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── composition.ts     # ÚNICO sitio que instancia adapters
│   │   └── tauri/
│   │       └── project-port.ts
│   └── src-tauri/src/
│       ├── lib.rs
│       ├── project.rs
│       ├── devserver.rs
│       ├── process.rs         # spawn genérico, no “opencode.rs de negocio”
│       └── proxy.rs
└── fixtures/                  # no commitear output del agente
```

`bridge.js` lo sirve el proxy desde `packages/preview-bridge`. Rust no lo reescribe.

## 3. Orden de construcción (no paralelizar el camino crítico)

Cada fase termina con un criterio de hecho. No empezar la siguiente sin él.

### Fase A — Cascarón (día 1)

- Tauri arranca. Tokens CSS aplicados. EmptyState según UI.md.
- `project_open` + persistir last path.
- `project_read_package` muestra nombre en titlebar.

Hecho: abro una carpeta y veo su nombre. Todavía no hay preview.

### Fase B — Preview vivo (día 1–2)

- `project_dev_start` / stop.
- Detectar URL del stdout o convention `http://localhost:3000`.
- Iframe directo primero (sin proxy) para verificar que el proyecto carga.
- Toolbar: reload, pill `live`.

Hecho: un `start-basic` se ve dentro de Steer.

### Fase C — Proxy + bridge (día 2–3)

- Reverse proxy en Rust (axum o similar ya usado en ecosistema Tauri).
- Inyectar `bridge.js` en HTML.
- Handshake `steer:ready`.
- Inspect ON: hover outline + `steer:hover`, click `steer:select`.
- Parser `data-tsd-source`.

Hecho: click en un H1 muestra `archivo:linea` en un `<pre>` de debug.

Bloqueador típico: Vite HMR websocket roto tras el proxy. Prioridad: reenviar `/@vite/client` y WS. Si se complica más de medio día, documentar fallback plugin Vite y seguir con Inspect solo en proyectos que lo tengan, pero **no abandonar el dato source**.

### Fase D — Inspector + overrides (día 3–4)

- Zustand selection + overrides.
- TweakList P0 (fontSize, color, textAlign, padding, radius, opacity).
- `steer:set-overrides` / clear.
- Scope toggle.
- Undo local `⌘Z`.

Hecho: subo font-size y el H1 cambia en el iframe. Recargar el iframe lo pierde. El repo en disco no cambió.

### Fase E — Cola de intents + chat UI (día 4)

- Encolar tweak (replace-by-prop) y comment.
- IntentBatchCard.
- Composer + `⌘Enter`.
- ApplyBar.

Hecho: veo el lote en el chat **sin** haber llamado a OpenCode. Puedo vaciar la cola.

### Fase F — Primer `AgentPort` (día 5–6)

- `packages/agent-opencode` implementa el port. Cero imports desde `ui`.
- `composition.ts` lo registra.
- Chat / ModelPopover consumen `listModels()` y `capabilities`, no URLs.
- Abort + `done` → `previewPort.clearOverrides()`.

Hecho: flujo feliz PRD §9. Un segundo adapter *podría* engancharse sin tocar InspectorPanel. El diff vive en el fixture, no en Steer.

### Fase G — Create Start + onboarding Devtools (día 6–7)

- `project_create_start`.
- Banner si falta source injection, con snippet copiable.
- Persistencia modelo + last session id.
- Debug drawer `⌘.`.

Hecho: alguien en máquina limpia (con Node, pnpm, opencode) completa empty → create → inspect → apply.

### Fase H — Pulido P0 (día 7+)

- Copy final, banners, statusbar, teclado del UX.md.
- Toast “preview no coincide”.
- Manejo preview down / OpenCode down.
- No features nuevas.

## 4. Repo de prueba

Usar siempre el mismo fixture:

```bash
npx @tanstack/cli create /tmp/steer-fixture -y
# asegurar Tailwind + @tanstack/devtools-vite
```

Hero con un `h1` y un `button`. No usar un repo propio grande hasta que el fixture pase.

## 5. Tareas atómicas (checklist)

Marcar en el PR / commits, un tema por commit.

- [ ] Workspaces + `@steer/domain` + tests source-loc / queue / serialize
- [ ] `@steer/ports` (`AgentPort` completo aunque solo haya un adapter)
- [ ] `@steer/app-state` con ports inyectados (mocks en test)
- [ ] `@steer/ui` tokens + EmptyState + AppShell
- [ ] `apps/desktop` composition root + Tauri `ProjectPort`
- [ ] Dev server spawn + health
- [ ] PreviewFrame iframe
- [ ] Proxy + inject `preview-bridge`
- [ ] Inspect hover/click → Selection
- [ ] Overlay CSS overrides
- [ ] Tweak rows P0 + pins + cola domain
- [ ] Chat transcript UI (genérico, sin logo OpenCode)
- [ ] `@steer/agent-opencode` health / models / startTurn / abort
- [ ] Registrar adapter en `composition.ts`
- [ ] Apply → AgentPort → clear overrides on done
- [ ] Model popover lee `listModels()` + `capabilities`
- [ ] Create Start command
- [ ] Devtools missing banner
- [ ] Debug drawer
- [ ] Keyboard shortcuts
- [ ] Error states UX.md §6
- [ ] Guardrail: lint o test de imports (ui no importa agent-opencode)

## 6. Convención de commits

```
feat(preview): inject inspect bridge via proxy
fix(agent): scope session to project directory
chore: add source-loc unit tests
```

No “WIP lots of stuff”. No commitear `src-tauri/target`.

## 7. Cómo trabajar con agentes de código (meta)

Este repo *es* un cliente de agentes, pero se construye también *con* agentes. Reglas:

1. Pegar / mantener `AGENTS.md` en la raíz antes de la primera sesión de vibecoding.
2. Una fase (A–H) por sesión de agente. No “implementa Steer”.
3. El agente que construye Steer no debe “demostrar” escribiendo source en el fixture a mano: el producto tiene que hacerlo vía Intent.
4. Si el agente propone un editor de código embebido o guardar CSS, rechazar (AGENTS.md).

## 8. Definición de hecho del prototipo

Las cinco pantallas de UI.md §13 existen y este script manual pasa:

1. Crear o abrir fixture Start.
2. Preview live.
3. Inspect click en H1 → path visible.
4. fontSize + textAlign + pin.
5. Aplicar con OpenCode (modelo elegido).
6. Archivo en disco cambió. `git diff` en el fixture lo prueba.
7. Overrides limpios. Reload preview = mismo look.
8. `git status` en el repo **Steer** no incluye archivos del fixture.

Si 6 o 7 fallan, el prototipo no está hecho, aunque la UI se vea bien.

## 9. Después del prototipo (no ahora)

- Adapter Grok Build / Claude Code detrás de `AgentHost`.
- Diff viewer del turno.
- Screenshot anotado.
- Switcher de rutas Start.
- **Vistas** (P2): misma ruta a 1440 / 768 / 390. Spec `docs/VISTAS.md`. Primero `PreviewPort` multi-stage, después el grid. No es un canvas de diseño.
- Plugin Vite `@steer/inspect` (sustituye el proxy inject).
- Alcance `token` / variant CVA.
- Empaquetado notarizado macOS.

Fecha de producto “usable” recordada internamente: marzo–julio 2027. El prototipo no es eso. Es el loop.
