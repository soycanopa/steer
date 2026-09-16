# AGENTS.md — Steer

Instrucciones para cualquier agente que trabaje **en este repositorio**. El humano construye Steer. Steer no es un editor.

Leer: `ARCHITECTURE.md` primero, luego `PRD.md`, `TRD.md`, `UX.md`, `UI.md`, `IMPLEMENTATION.md`.

## Qué es este repo

Monorepo: producto en paquetes TypeScript, host OS en Tauri 2 / Rust. Abre un proyecto TanStack Start, serializa gestos como `Intent`, un `AgentPort` escribe el source del **proyecto abierto**.

Steer nunca es source of truth del diseño. OpenCode es el primer adapter, no el núcleo.

## Reglas duras

1. **La UI no escribe source del proyecto del usuario.** Overlay efímero. Persiste el agente-producto vía `AgentPort`.
2. **No construyas un editor de código** (Monaco, file tree editable, etc.).
3. **No construyas un canvas tipo Figma.** P0 = un iframe. P2 **Vistas** = N iframes del mismo `dev` (default 1440 / 768 / 390), una selección, overlay efímero. No frames vacíos, no zoom de mesa, no capas que no sean el DOM. Spec: `docs/VISTAS.md`. No lo implementes hasta que P0 cierre.
4. **React no habla con providers.** Ni `fetch` a `:4096`, ni stdio. Solo `app-state` → `AgentPort`.
5. **Rust no conoce Intent.** Host: fs, spawn, proxy, dialog.
6. **No inventes `data-tsd-source`.** Banner + bloquear Apply.
7. **No commitees** fixture ni `src-tauri/target`.
8. **No features fuera de P0.**
9. **No forks Stacki / clones Forge.**
10. **No backend cloud.**
11. **No cambies `Intent` o `AgentPort` sin actualizar ARCHITECTURE + TRD + tests del domain.**
12. **Un provider nuevo = `packages/agent-<id>` + una línea en `composition.ts`.** Si tocaste `InspectorPanel` para sumarlo, está mal.

## Dónde va cada cosa

| Cosa | Sitio | Importa |
| --- | --- | --- |
| Intent, cola, serializer | `packages/domain` | nada de app |
| `AgentPort` / `ProjectPort` / `PreviewPort` | `packages/ports` | domain tipos |
| Store / apply() | `packages/app-state` | domain + ports |
| Pantallas, sliders, chat | `packages/ui` | domain tipos, callbacks |
| Protocolo iframe | `packages/preview-bridge` | domain Selection |
| OpenCode HTTP+SSE | `packages/agent-opencode` | ports + domain |
| Cursor / Grok / Antigravity / futuro Claude / ACP | `packages/agent-*` | ports + domain |
| Wiring | `apps/desktop/src/composition.ts` | todos los adapters |
| Spawn / proxy / dialog | `apps/desktop/src-tauri` | — |

Prohibido: `src/utils/helpers.ts` cajón. Prohibido: `packages/ui` → `agent-opencode`.

## Stack

- TS packages + pnpm workspaces
- React solo en `packages/ui` y el mount de `apps/desktop`
- Zustand solo en `app-state`
- Tauri/Rust solo host
- Primer provider: OpenCode serve

No Electron, no Next dentro de Steer, no Redux, no lógica de chat en Rust.

## Cómo implementar un cambio

1. Fase A–H de IMPLEMENTATION. No saltes.
2. Contratos (`domain` / `ports`) antes que UI.
3. Adapter nuevo: tests con HTTP fake, luego register en composition.
4. Preview solo vía mensajes `steer:*`.
5. `done` del port ⇒ `clearOverrides`.
6. Fixture Start, no repos enormes.

## Prompt hacia el agente-producto

Vive en `packages/domain` (`serialize-turn`). Plantilla TRD §7. Los adapters no la “mejoran” volviéndola vaga.

## Estilo

- TypeScript estricto. No `any`.
- Copy UI en español. Código en inglés.
- Commits `feat(domain):`, `feat(agent-opencode):`, `feat(ui):`, `feat(host):`.

## Rechazar en review

- UI que instancia `OpencodeAgent`
- Guardar overlay CSS en el repo del usuario
- Sliders que escriben Tailwind
- Client OpenCode dentro de un `.tsx` de panel
- `Intent` duplicado en Rust
- Lista hardcodeada de modelos
- Autocommit
- Dependencias no pedidas
