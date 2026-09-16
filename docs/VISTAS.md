# Vistas — multi-preview (P2)

Versión: 0.1  
Fecha: 2026-09-16  
Estado: decisión de producto. No implementar hasta cerrar el loop P0.  
Complementa: PRD.md §7, UX.md §4 / §5, AGENTS.md

## Decisión

Steer gana un modo **Vistas**: tres previews del mismo `pnpm dev` a la vez — desktop 1440, tablet 768, móvil 390 — de la **misma ruta**.

No es un canvas de diseño (Paper, Fountible, Figma). Es un layout de monitores sobre la app real.

## Qué es

```
Vista única (P0)          Vistas
─────────────────         ─────────────────────────────
1 iframe                  3 iframes del mismo dev
1 ruta × 1 ancho          1 ruta × 1440 / 768 / 390
1 selección               1 selección (en el stage activo)
overlay efímero           overlay replicado a la misma ruta
Aplicar → agente          Aplicar → lote + foto del stage activo
```

Cada recuadro es una ventana a localhost, no un artboard. Solo existe si la ruta existe en el router Start. No hay frame vacío.

## Qué no es

- Mesa infinita, zoom/pan de mundo, frames huérfanos
- Recuadro en blanco “nueva pantalla”
- Dibujar capas que no son DOM de la app
- Arrastrar componentes entre recuadros
- Source of truth del diseño (sigue siendo el repo)
- Sliders que escriben Tailwind
- Editor de tokens

Si una idea necesita cualquiera de eso, no entra en Vistas.

## Layout

```
┌─────────────────┬─────────────────┬──────────┐
│ /  ·  1440      │ /  ·  768       │Inspector │
│ desktop         │ tablet          │          │
├─────────────────┼─────────────────┤ Chat     │
│ /  ·  390                         │ Aplicar  │
│ móvil                             │          │
└───────────────────────────────────┴──────────┘
```

- Toggle en chrome: **Vista única | Vistas**. Atajo tentativo: `D`.
- Un stage está **activo**. Inspect, pines y sliders viven ahí.
- Overlay de tweaks se replica a los stages de la misma ruta (default on).
- Tope: 4 stages. El cuarto es otra ruta, no un quinto breakpoint.
- No hay zoom de canvas. Reordenar stages sí.

Default al entrar a Vistas: ruta actual × 1440 / 768 / 390.

## Contratos (cuando se implemente)

No se fragmenta `Intent`. El board es contexto del turno:

- `ApplyPayload.board?` con la lista de stages y el activo
- `Selection.viewport?` para que un pin “en 390” no dependa de prosa
- `PreviewPort` pasa a ser por `stageId` (el costo real)
- Mensajes `steer:*` llevan `stageId`
- Al Aplicar, default on: un `Intent` `screenshot` del stage activo
- `serialize-turn` añade un bloque `## Board`

Hasta que esos contratos existan, no se pinta el grid.

## Criterio de cerrado

Tweak de tipo en `/` desktop + pin “en 390 el heading se parte” + foto → diff en el archivo correcto → overlay limpio en los tres stages.

## Orden

1. Loop P0 de un preview redondo (`data-tsd-source` → apply → HMR → overlay muere).
2. `PreviewPort` + protocolo multi-stage.
3. Misma ruta × 3 viewports.
4. Foto del stage activo en el turno.
5. Recién después, una segunda ruta como cuarto stage.

## Copy

- Toggle: **Vista única** / **Vistas**
- Stage: `/  ·  390`
- Aplicar: **Aplicar (n) · incluye foto de / 390**
- Añadir: **Añadir vista** → elige ruta + viewport. No hay “nuevo frame”.
