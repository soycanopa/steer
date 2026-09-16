# Steer

Nombre de trabajo. Lienzo de intención sobre un proyecto **TanStack Start** real: tú señalas, comentas y ajustas; el agente escribe el código. No es un editor WYSIWYG.

Este directorio es el paquete de definición del **prototipo**. Siéntate a construir con estos documentos, en este orden:

| Documento | Para qué |
| --- | --- |
| [PRD.md](./PRD.md) | Qué es, para quién, qué entra en el prototipo y qué no |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | Módulos, puertos, stack real (Rust ≠ producto), cómo sumar providers |
| [TRD.md](./TRD.md) | Contratos, tipos, bridge, OpenCode como primer adapter |
| [UX.md](./UX.md) | Principios, flujos, teclado, estados vacíos |
| [UI.md](./UI.md) | Layout, componentes, tokens visuales, estados de UI |
| [IMPLEMENTATION.md](./IMPLEMENTATION.md) | Fases, árbol de repo, tareas, criterio de hecho |
| [VISTAS.md](./VISTAS.md) | P2: multi-preview 1440 / 768 / 390. No es canvas de diseño |
| [AGENTS.md](../AGENTS.md) | Reglas para cualquier agente que toque el código |

## Idea en una frase

El preview *es* la app. La UI nunca persiste source. Cada gesto se serializa como `Intent` y el agente lo aplica al repo. HMR cierra el loop.

## Stack del prototipo

No es “un app Rust”. Es un monorepo TypeScript con un host Tauri delgado.

- **Producto:** packages TS (`domain`, `ports`, `app-state`, `ui`, `agent-opencode`, `agent-cursor`, `agent-grok`, `preview-bridge`)
- **Host OS:** Tauri 2 / Rust — ventana, fs, spawn, proxy. Cero Intents en Rust
- **UI:** React + Tailwind v4 en `packages/ui` (no habla con providers)
- **Estado:** Zustand en `packages/app-state` (única orquestación)
- **Proyecto objetivo:** TanStack Start + `@tanstack/devtools-vite` (`data-tsd-source`)
- **Primer agent adapter:** OpenCode `opencode serve` HTTP+SSE. El siguiente es otro package, no un if en el chat

Detalle y matriz de imports: [ARCHITECTURE.md](../ARCHITECTURE.md).

## Relación con Forge / Stacki

Forge (UI8) es la referencia de *sensación*, no el producto a clonar. Stacki no se forkear. Steer nace from scratch, scoped a TanStack Start, OSS, con control de modelo (razonamiento / effort) que Forge deja corto.
