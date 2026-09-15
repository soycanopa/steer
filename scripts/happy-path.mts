/**
 * Happy path manual runner — IMPLEMENTATION.md §8.
 * Simula el lote que la UI enviaría y verifica git diff en el fixture.
 *
 * Prereqs:
 *   opencode serve --port 4097 --hostname 127.0.0.1
 *   cd /tmp/steer-fixture && pnpm dev --port 3002
 *
 * Usage: pnpm happy-path
 */

import { execSync } from "node:child_process";
import {
  buildApplyPayload,
  enqueueComment,
  enqueueTweak,
  type Selection,
} from "@steer/domain";
import {
  createOpencodeAgent,
  AGENT_OPENCODE_FALLBACK_URLS,
} from "@steer/agent-opencode";
import type { AgentEvent, ModelRef, SessionId } from "@steer/ports";

const FIXTURE = process.env.STEER_FIXTURE ?? "/tmp/steer-fixture";
const OPENCODE_URL =
  process.env.OPENCODE_URL ?? "http://127.0.0.1:4097";

function log(step: string, detail?: string): void {
  const msg = detail ? `${step} — ${detail}` : step;
  console.log(`\n▸ ${msg}`);
}

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function selectionForH1(): Selection {
  return {
    source: { file: "/src/routes/index.tsx", line: 12, col: 9 },
    component: "index",
    route: "/",
    tag: "h1",
    textPreview: "Start simple, ship quickly.",
    computed: {
      fontSize: "36px",
      textAlign: "start",
    },
    breadcrumb: ["index", "h1"],
  };
}

async function pickModel(
  agent: ReturnType<typeof createOpencodeAgent>,
): Promise<ModelRef> {
  const models = await agent.listModels();
  if (models.length === 0) fail("OpenCode no devolvió modelos.");

  const env = process.env.STEER_MODEL;
  if (env != null && env !== "") {
    const [providerId, modelId] = env.split("/");
    const hit = models.find(
      (m) => m.providerId === providerId && m.modelId === modelId,
    );
    if (hit != null) return hit;
    fail(`STEER_MODEL=${env} no encontrado en /config/providers`);
  }

  const preference = [
    "opencode/big-pickle",
    "minimax-coding-plan/MiniMax-M2.5-highspeed",
    "zai-coding-plan/glm-4.7",
    "deepseek/deepseek-v4-flash",
  ];
  for (const key of preference) {
    const [providerId, modelId] = key.split("/");
    const hit = models.find(
      (m) => m.providerId === providerId && m.modelId === modelId,
    );
    if (hit != null) return hit;
  }
  return models[0];
}

async function runTurn(
  agent: ReturnType<typeof createOpencodeAgent>,
  model: ModelRef,
  payload: ReturnType<typeof buildApplyPayload>,
): Promise<{ sessionId: SessionId | null; text: string }> {
  let sessionId: SessionId | null = null;
  let text = "";

  const events = agent.startTurn({
    directory: payload.projectRoot,
    sessionId: null,
    model,
    extras: { agent: "build" },
    parts: [{ type: "intents", payload }],
  });

  for await (const ev of events) {
    switch (ev.type) {
      case "session":
        sessionId = ev.sessionId;
        log("sesión", sessionId);
        break;
      case "text-delta":
        text += ev.text;
        process.stdout.write(ev.text);
        break;
      case "tool":
        log(
          `tool ${ev.status}`,
          `${ev.name}${ev.detail ? `: ${ev.detail}` : ""}`,
        );
        break;
      case "permission":
        log("permiso", ev.summary);
        if (sessionId == null || agent.respondPermission == null) {
          fail("Permiso sin sesión o respondPermission no disponible.");
        }
        await agent.respondPermission(sessionId, ev.permissionId, true, false);
        log("permiso", "aceptado (once)");
        break;
      case "done":
        log("turno", "done");
        return { sessionId, text };
      case "error":
        fail(ev.message);
      default:
        break;
    }
  }
  return { sessionId, text };
}

async function main(): Promise<void> {
  console.log("Steer happy path");
  console.log(`fixture: ${FIXTURE}`);
  console.log(`opencode: ${OPENCODE_URL}`);

  log("1/6", "health OpenCode");
  const agent = createOpencodeAgent({ baseUrl: OPENCODE_URL });
  const health = await agent.health();
  if (!health.ok) {
    fail(
      health.detail ??
        `OpenCode no responde. Prueba: opencode serve --port 4097 (${AGENT_OPENCODE_FALLBACK_URLS.join(", ")})`,
    );
  }
  log("health", `ok v${health.version ?? "?"}`);

  log("2/6", "fixture dev server");
  try {
    const html = await fetch("http://127.0.0.1:3002/").then((r) => r.text());
    if (!html.includes('data-tsd-source="/src/routes/index.tsx:12:9"')) {
      fail("El H1 del fixture no tiene data-tsd-source esperado.");
    }
    log("source", "data-tsd-source en H1 ✓");
  } catch {
    fail("Fixture dev no responde en :3002. Arranca: cd /tmp/steer-fixture && pnpm dev --port 3002");
  }

  log("3/6", "construir cola de intents");
  const sel = selectionForH1();
  let queue = enqueueTweak([], {
    selection: sel,
    scope: "instance",
    prop: "fontSize",
    from: "36px",
    to: "48px",
  });
  queue = enqueueTweak(queue, {
    selection: sel,
    scope: "instance",
    prop: "textAlign",
    from: "start",
    to: "center",
  });
  const { queue: withComment } = enqueueComment(queue, {
    selection: sel,
    scope: "instance",
    pin: 1,
    body: "Más display, menos UI copy.",
  });
  const payload = buildApplyPayload(withComment, FIXTURE, { route: "/" });
  log("intents", `${payload.intents.length} en cola`);

  log("4/6", "elegir modelo");
  const model = await pickModel(agent);
  log("modelo", `${model.providerId}/${model.modelId}`);

  log("5/6", "aplicar al agente (puede tardar 1–3 min)");
  console.log("--- stream ---");
  await runTurn(agent, model, payload);
  console.log("\n--- fin stream ---");

  log("6/6", "git diff en fixture");
  let diff = "";
  try {
    diff = execSync("git diff", { cwd: FIXTURE, encoding: "utf8" });
  } catch (err) {
    fail(`git diff falló: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (diff.trim() === "") {
    fail(
      "git diff vacío — el agente no escribió en el fixture. Revisa el stream arriba.",
    );
  }

  if (!diff.includes("index.tsx")) {
    fail(`git diff no toca index.tsx:\n${diff.slice(0, 800)}`);
  }

  console.log("\n✓ Happy path cerrado.");
  console.log("--- git diff (primeras líneas) ---");
  console.log(diff.split("\n").slice(0, 40).join("\n"));
  if (diff.split("\n").length > 40) console.log("…");
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
