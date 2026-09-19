// Prueba de integración del adapter v2 contra un server real (no se commitea).
// Uso: tsx scripts/opencode-v2-probe.mts <baseUrl> <password>
import { createOpencodeAgent } from "../packages/agent-opencode/src/index";

const [baseUrl, password] = process.argv.slice(2);

const agent = createOpencodeAgent({ baseUrl });
agent.setAuth(password ? { username: "opencode", password } : null);

const health = await agent.health();
console.log("health:", JSON.stringify(health));

const models = await agent
  .listModels()
  .catch((e: unknown) => `listModels ERROR: ${(e as Error).message}`);
console.log(
  "models:",
  Array.isArray(models)
    ? `${models.length} — primeros: ${models
        .slice(0, 5)
        .map((m) => `${m.providerId}/${m.modelId}${m.capabilities.reasoning ? "*" : ""}`)
        .join(", ")}`
    : models,
);

if (!Array.isArray(models) || models.length === 0) {
  console.log("sin providers conectados: intento con /api/model/default …");
  const res = await fetch(`${baseUrl}/api/model/default`, {
    headers: password
      ? { authorization: `Basic ${btoa(`opencode:${password}`)}` }
      : {},
  });
  const body = (await res.json()) as {
    data?: { modelID?: string; providerID?: string; name?: string };
  };
  const def = body.data;
  if (def?.modelID == null || def?.providerID == null) {
    console.log("tampoco hay default utilizable");
    process.exit(0);
  }
  models.push({
    providerId: def.providerID,
    adapterId: "opencode",
    modelId: def.modelID,
    label: def.name ?? def.modelID,
    capabilities: {
      reasoning: false,
      effort: false,
      images: false,
      tools: true,
    },
  });
}

const model = models[0];
const events: string[] = [];
const turn = agent.startTurn({
  directory: process.cwd(),
  sessionId: null,
  model,
  extras: {},
  parts: [{ type: "text", text: "Reply with exactly: OK" }],
});

const timeout = setTimeout(() => {
  console.log("TIMEOUT 60s — eventos vistos:", events.join(" | "));
  process.exit(2);
}, 60_000);

for await (const ev of turn) {
  const tag =
    ev.type === "tool"
      ? `${ev.type}:${ev.name}:${ev.status}`
      : ev.type === "text-delta" || ev.type === "reasoning-delta"
        ? `${ev.type}(${ev.text.length})`
        : ev.type;
  events.push(tag);
  if (ev.type === "text-delta") process.stdout.write(ev.text);
  if (ev.type === "session") console.log("[session]", ev.sessionId);
  if (ev.type === "error") console.log("\n[error]", ev.message);
  if (ev.type === "done") console.log("\n[done]");
}
clearTimeout(timeout);
console.log("eventos:", events.slice(0, 40).join(" | "));
