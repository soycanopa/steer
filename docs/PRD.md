# PRD — Steer (prototipo)

Versión: 0.1  
Fecha: 2026-09-11  
Estado: listo para construir  
Nombre: Steer (trabajo; renombrable sin cambiar contratos)

## 1. Problema

Diseñar y refinar una UI en un repo TanStack Start hoy obliga a saltar entre browser, DevTools, editor y chat del agente. El humano describe con palabras lo que ya está viendo. El agente adivina el nodo. El diseño se diluye en prompts.

Forge demostró el loop correcto: canvas = app real, inspect + pines + sliders, agente escribe en disco. Lo que falta para este proyecto:

- Control real del modelo (razonamiento, effort, extras del provider).
- Stack first-class: TanStack Start, no “Vite o Next genérico”.
- La UI no es un editor. Es un volante.
- OSS, construido from scratch (no fork de Stacki ni de Forge).

## 2. Solución

Steer es un cliente de escritorio que abre un proyecto TanStack Start local, lo renderiza en un preview vivo y deja que el usuario:

1. Seleccione secciones o nodos.
2. Deje comentarios anclados.
3. Ajuste tipografía, color, alineación y spacing *en el preview* (como DevTools).
4. Envíe esos gestos al agente como items de chat estructurados.
5. Reciba el cambio en source + HMR, sin haber tocado el archivo.

El usuario se queda con el código. Steer no es source of truth.

## 3. Principios de producto (no negociables)

1. **La UI no escribe source.** Ni clases Tailwind, ni CSS, ni JSX. Solo intents.
2. **El preview es la app.** Un iframe del `dev` del proyecto. Si no corre ahí, no existe.
3. **Cada gesto es un Intent.** Select, comment, tweak, screenshot. Tipado. Auditable.
4. **El agente es el único editor.** Traduce intención a tokens / CVA / Tailwind / componente.
5. **Instancia ≠ componente ≠ token.** El usuario elige el alcance antes de aplicar.
6. **El repo es del usuario.** Git lo maneja él. Steer no commitea en el prototipo.
7. **El modelo se elige de verdad.** Provider instalado + modelo + parámetros que el adapter exponga (reasoning/effort cuando existan).
8. **Providers son plugins.** La UI habla con `AgentPort`. OpenCode es el primero, no el diseño. Sumar Claude Code / Grok Build / ACP no reescribe el inspector.
9. **Cada cosa vive en su paquete.** Domain, puertos, UI, adapters y host Rust no se mezclan. Ver ARCHITECTURE.md.

## 4. Usuario

Único persona en el prototipo: **el builder** — developer que ya tiene (o va a crear) un repo TanStack Start y usa agentes de código (OpenCode primero). Diseña en código y quiere dirigir visualmente sin convertirse en operador de Figma.

Fuera de alcance del prototipo: equipos, diseñadores sin repo, clientes no técnicos.

## 5. Jobs to be done

- Abrir un proyecto Start y verlo vivo dentro de Steer.
- Señalar un heading / botón / sección y saber *qué archivo y línea* es.
- Decir “esto más display, menos UI copy” sin escribir un prompt de 12 líneas.
- Subir el font-size, cambiar color y alineación, verlo ya, y mandar el lote al agente.
- Elegir OpenCode + modelo + reasoning y ver el agente aplicar el cambio.
- Seguir dueño del repo.

## 6. Alcance del prototipo (P0)

Un loop cerrado, un proyecto, un agente, una ruta visible.

| ID | Requisito | Prioridad |
| --- | --- | --- |
| P0-01 | Crear proyecto Start nuevo (CLI TanStack) o abrir uno existente | P0 |
| P0-02 | Detectar / arrancar `pnpm dev` (o el package manager del repo) y embeber preview | P0 |
| P0-03 | Modo Inspect: hover outline, click selecciona | P0 |
| P0-04 | Resolver `data-tsd-source` → `{ file, line, col }` | P0 |
| P0-05 | Panel de selección: breadcrumb elemento → componente → ruta | P0 |
| P0-06 | Alcance: esta instancia / este componente | P0 |
| P0-07 | Comentario anclado (pin numerado) sobre la selección | P0 |
| P0-08 | Tweaks preview-only: font-size, color, text-align, padding, gap, radius, opacity | P0 |
| P0-09 | Cada tweak y comentario se encola como Intent visible en el chat | P0 |
| P0-10 | “Aplicar al agente” serializa el lote a un prompt estructurado | P0 |
| P0-11 | Adapter OpenCode: `opencode serve`, sesión, mensaje, SSE | P0 |
| P0-12 | Selector de provider/modelo desde `/config/providers` | P0 |
| P0-13 | Campo de reasoning/effort visible; se envía si el modelo lo soporta, si no se ignora con hint | P0 |
| P0-14 | Stream del agente en el chat (texto + tool calls básicos) | P0 |
| P0-15 | Al terminar el turno, limpiar overrides del preview y dejar HMR | P0 |
| P0-16 | Chat libre además de intents (el usuario puede escribir) | P0 |
| P0-17 | Abortar turno en curso | P0 |
| P0-18 | Persistencia local: último proyecto, última sesión, prefs de modelo | P0 |

## 7. Fuera de alcance del prototipo (P2+)

No construir esto ahora. Si aparece la tentación, releer esta lista.

- Canvas de diseño (Figma / Paper / Fountible): frames vacíos, capas que no son el DOM, zoom de mesa, archivo de diseño. Un preview en P0; **Vistas** (P2) son N iframes del mismo `dev`, ver [VISTAS.md](./VISTAS.md)
- Escribir source desde sliders
- Fork de Stacki / clonar UX pixel-perfect de Forge
- Multi-agente simultáneo, ACP genérico, Claude Code / Grok Build adapters
- Deploy, preview URLs, Forge Cloud
- Figma MCP / import
- Git commit / branch UI
- Auth de equipo, cloud sync, multiplayer
- Responsive editor completo (breakpoints custom, container queries)
- Theme tokens editor visual
- Component palette / drag & drop de primitivas
- Windows como target de empaquetado (macOS primero; Linux ok en dev)
- Marketplace de prompts
- Edición de copy inline que se persista sola

P1 (después del loop P0, no antes):

- Switcher de rutas del Start router
- Screenshot anotado como attachment del Intent
- Breadcrumb hasta token / CVA variant
- Diff del turno (vía `AgentPort`, no vía fetch OpenCode en UI)
- Permisos del agente (accept / deny) si el port los emite
- Segundo adapter (`packages/agent-cursor`, luego `agent-grok`) registrando el mismo `AgentPort`
- Inventario de componentes del proyecto (archivos en `src/components` u homólogo): ver lo que el agente creó o reutilizó. No paleta tipo Figma, no drag & drop de primitivas, no canvas de frames vacíos. Una lista; el preview sigue siendo la página viva.

P2 — **Vistas** (decisión 2026-09-16, spec en [VISTAS.md](./VISTAS.md)):

- Toggle Vista única | Vistas. Misma ruta a 1440 / 768 / 390 (desktop, tablet, móvil)
- Un selection. Overlay replicado a stages de la misma ruta. Tope 4 (el cuarto es otra ruta)
- Al Aplicar: lote + screenshot del stage activo. `ApplyPayload.board?` como contexto
- No es canvas de diseño: cada recuadro es un iframe del `dev`, no un artboard
- No implementar hasta que el loop P0 cierre

El “canvas infinito con todas las rutas como frames” de la lista de arriba sigue fuera. Vistas no lo abre.

## 8. Experiencia de referencia (no spec)

Forge UI8: inspect, pines numerados, sliders de props, style breadcrumb, agentes locales, edits en disco. Copiar la *mecánica*, no la marca, no el canvas infinito, no su modelo de params.

DevTools de Chrome: mutación visual inmediata, efímera. Steer añade “mandar esto al agente”.

TanStack Source Inspector: el atributo `data-tsd-source` es el puente DOM → archivo. No reinventarlo.

## 9. Flujo feliz (prototipo)

1. Abre Steer. Elige “Abrir proyecto” → carpeta con `package.json` + TanStack Start.
2. Steer arranca el dev server si no está vivo. El preview carga.
3. Activa Inspect (`I` o toggle). Hover pinta outline. Click selecciona el H1 del Hero.
4. Panel derecho: `Hero.tsx:42` · alcance “esta instancia”.
5. Sube font-size 32 → 40. Cambia align a center. El H1 se ve distinto ya.
6. Pin #1: “Más display, menos UI copy.”
7. Pulsa “Aplicar (3 intents)”. El chat inserta un bloque estructurado y dispara OpenCode.
8. El agente edita `Hero.tsx` (p. ej. `text-4xl` + `text-center`). HMR refresca. Los overrides mueren. El H1 se ve igual, ahora de verdad.

## 10. Métricas de éxito del prototipo

Cualitativo, no vanity:

- Un usuario que ya tiene un repo Start completa el flujo feliz en < 10 minutos la primera vez.
- Un tweak de font-size + un comentario producen un diff *en el archivo correcto*, no un `<style>` inyectado.
- Después de HMR, recargar el preview sin Steer muestra el mismo resultado.
- El usuario puede nombrar qué modelo usó y si reasoning estaba on.
- Cero escrituras de source desde el overlay.

Fallo automático del prototipo:

- La UI escribe clases o CSS al disco.
- El agente no sabe qué nodo se seleccionó.
- El preview es un renderer paralelo, no el dev server del repo.
- El loop requiere copiar/pegar a otro chat.

## 11. Riesgos de producto

| Riesgo | Mitigación |
| --- | --- |
| Convertirse en editor | PRD §3 y AGENTS.md lo prohíben. Sliders = preview + Intent |
| `data-tsd-source` ausente | Onboarding: exigir plugin Vite de TanStack Devtools; bloquear Inspect con CTA |
| El agente aplica px crudos | System prompt del turno: preferir tokens / escala Tailwind |
| Scope erróneo (cambia todos los botones) | Toggle instancia / componente obligatorio antes de Aplicar |
| OpenCode no expone reasoning | UI visible + adapter feature-detect; no bloquear el envío |
| HMR vs overlay pelean | Overrides en stylesheet del iframe keyed; wipe on agent-done y on navigation |

## 12. Posicionamiento

Steer no compite con Figma ni con VS Code. Compite con el prompt ciego. Es el volante de un agente que ya sabe editar el repo.

## 13. Open questions (no bloquean P0)

- Nombre final.
- ¿El prototipo web-only (Vite) se valida 3–5 días antes de Tauri, o Tauri desde el commit 1? Decisión por defecto: **Tauri desde el commit 1**, con escape hatch web para el bridge.
- ¿Un solo preview o también vista “ruta actual + layout”? Default: un iframe.
- Licencia OSS (sugerida MIT) — decidir al publicar, no para construir.
