# Pulido P0 — después del loop

El loop feliz ya se cerró a mano: inspect → tweaks/pins → cola en chat → Apply → OpenCode escribe source → preview se actualiza.

Esta rama es **solo revisión y pulido de P0**. No Vistas. No segundo adapter. No canvas.

## 1. Verificar IDs que el loop no cubre

| ID | Qué probar | Hecho |
| --- | --- | --- |
| P0-01 | Crear Start desde empty, no solo abrir un repo | sí |
| P0-06 | Alcance Instancia vs Componente en el inspector | pendiente de entender / probar |
| P0-13 | Reasoning en el selector de modelo (oculto o hint si el modelo no lo soporta) | cubierto en el selector |
| P0-17 | Abortar turno a mitad (botón rojo / ⌘Enter); cola no se pierde | |
| P0-15 | Tras Apply, overlay limpio y reload = mismo look que disco | parcial (loop ya visto) |

**P0-06 en una frase:** en el inspector, **Instancia** = solo el nodo que clicaste; **Componente** = todos los usos del mismo source (`Button` en tres sitios, un slider pinta los tres). El overlay usa `data-tsd-source` en componente y `data-steer-id` en instancia. Hace falta un componente repetido en la página para verlo.

## 2. Bugs de código (siguen)

- **Chat `prt_…` keys duplicadas** en consola durante el stream.
- **Fast Refresh de `ChatPanel`:** `tweakEditLabel` vive en `tweak-label.ts`.
- **Recover Vite tras Apply:** un Apply más para confirmar que no queda “Upstream inalcanzable”.

## 3. Ajustes ya hechos en esta rama (sin commit aún)

- Composer del chat: sin beam, borde más grueso, sombra, padding simétrico.
- Chip de comentario/edición se baja del composer al enviar (vuelve si falla o abortas).

## 4. Fuera de esta rama

- Vistas (P2)
- Inventario de componentes que crea el agente (P1): lista de `src/components`, no paleta Figma. El alcance Instancia/Componente del inspector no sustituye eso.
- Diff del turno, screenshot, switcher de rutas (P1)
- Empaquetado notarizado
