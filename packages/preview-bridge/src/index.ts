// Protocolo iframe steer:* + bridge.js — TRD §6.
// Implementación en Fase C: handshake steer:ready, inspect, overrides,
// parser data-tsd-source. Rust sirve bridge.js desde este package; no lo
// reescribe. Los tipos del protocolo viven en @steer/ports.

export type { FrameToParent, ParentToFrame } from "@steer/ports";
