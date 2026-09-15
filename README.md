# Steer

**Tú diriges. El agente escribe.**

Cliente de escritorio (macOS) que abre un proyecto [TanStack Start](https://tanstack.com/start), lo muestra en un preview vivo y convierte gestos —inspección, pines, sliders, captura— en `Intent`s. Un `AgentPort` (OpenCode primero) escribe el source **en el repo del usuario**. Steer no es un editor ni el source of truth del diseño.

## Qué hace

1. Abre un proyecto local y embebe `pnpm dev` (vía proxy + bridge).
2. Inspecciona nodos (`data-tsd-source` → archivo:línea).
3. Encola tweaks (overlay CSS efímero) y comentarios anclados.
4. Aplica el lote al agente. Al `done`, limpia el overlay y deja el HMR.

La UI **nunca** escribe Tailwind, CSS ni JSX. El agente es el único que toca disco.

## Requisitos

- Node ≥ 22, [pnpm](https://pnpm.io) 12
- Rust / [Tauri 2](https://v2.tauri.app)
- [OpenCode](https://opencode.ai) CLI (`opencode serve`)
- Un proyecto TanStack Start con script `dev` (Devtools source injection recomendado)

## Arranque

```bash
pnpm install
pnpm dev
```

Eso lanza Vite + Tauri (`apps/desktop`). En otra terminal, si el puerto 4096 está ocupado:

```bash
opencode serve --port 4097 --hostname 127.0.0.1
```

Steer prueba `4096` y cae a `4097` / `4098` / `4095`.

## Monorepo

| Paquete | Rol |
| --- | --- |
| `packages/domain` | Intent, cola, serializer del prompt |
| `packages/ports` | `AgentPort`, `ProjectPort`, `PreviewPort` |
| `packages/app-state` | Store Zustand, `apply()` |
| `packages/ui` | Chrome, inspector, chat (copy en español) |
| `packages/preview-bridge` | Protocolo `steer:*` en el iframe |
| `packages/agent-opencode` | Adapter HTTP + SSE a `opencode serve` |
| `apps/desktop` | Host Tauri: fs, spawn, proxy, diálogo |

Un provider nuevo = `packages/agent-<id>` + una línea en `apps/desktop/src/composition.ts`. La UI no importa adapters.

## Docs

Leer en este orden: [`ARCHITECTURE.md`](ARCHITECTURE.md), [`docs/PRD.md`](docs/PRD.md), [`docs/TRD.md`](docs/TRD.md), [`docs/UX.md`](docs/UX.md), [`docs/UI.md`](docs/UI.md), [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md), [`AGENTS.md`](AGENTS.md).

## Fuera de alcance (prototipo)

Editor de código, canvas tipo Figma, backend cloud, autocommit, sliders que escriban Tailwind, clonar Forge/Stacki.

Licencia: aún no publicada. El código del **proyecto abierto** sigue siendo tuyo.
