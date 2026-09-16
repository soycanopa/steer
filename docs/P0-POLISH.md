# Pulido P0 — después del loop

El loop feliz ya se cerró a mano: inspect → tweaks/pins → cola en chat → Apply → OpenCode escribe source → preview se actualiza.

Esta rama es **solo revisión y pulido de P0**. No Vistas. No segundo adapter. No canvas.

## 1. Verificar IDs que el loop no cubre

| ID | Qué probar | Hecho |
| --- | --- | --- |
| P0-01 | Crear Start desde empty, no solo abrir un repo | |
| P0-06 | Alcance instancia vs componente: un override pinta todas las instancias | |
| P0-13 | Reasoning visible; modelo sin support → hint, no error | |
| P0-17 | Abortar turno a mitad; cola no se pierde | |
| P0-15 | Tras Apply, overlay limpio y reload = mismo look que disco | |

## 2. Bugs vistos en la prueba manual

- **Chat `prt_…` keys duplicadas.** Consola llena durante el stream. Arreglar keys de tool/partes del transcript.
- **Fast Refresh de `ChatPanel`.** `tweakEditLabel` exportado rompe HMR; hay que recargar la ventana. Mover el helper o dejar de exportarlo desde el módulo del panel.
- **Vite muerto tras Apply.** Ya hay `recoverPreview` + retry del proxy. Confirmar un Apply más: el iframe no debe quedarse en “Upstream inalcanzable”.
- **Capas vacías.** El copy ya no culpa solo a Devtools. Si el preview está caído, el árbol no debería pasar a `empty` como si faltara source.

## 3. Ajustes de producto (P0, no features nuevas)

- Cola persistente hasta Apply: ya está; probar rebuild con comentarios + tweaks sin enviar.
- Chips agrupados (ediciones + comentarios en una fila) desde el primero: probar clic → inspector / popover.
- Recargar preview / Reintentar debe respawnear Vite si `:3000` murió, no no-op en `live`.
- Toast mismatch (preview ≠ tweak) en un caso real post-Apply.
- Guardrail de imports UI (`check-imports.mjs`) sigue verde.

## 4. Fuera de esta rama

- Vistas (P2)
- Diff del turno, screenshot, switcher de rutas (P1)
- Empaquetado notarizado
