import { createOpencodeAgent } from "@steer/agent-opencode";

const baseUrl = process.env.OPENCODE_URL ?? "http://127.0.0.1:4097";
const directory =
  process.env.STEER_DIRECTORY ??
  "/Volumes/Masa/Projects/Mac/Steer/fixtures/start-basic";

const agent = createOpencodeAgent({ baseUrl });
const health = await agent.health();
console.log("health", health);
if (!health.ok) process.exit(1);

const models = await agent.listModels();
const model =
  models.find((m) => m.providerId === "opencode" && m.modelId === "big-pickle") ??
  models[0];
console.log("model", `${model.providerId}/${model.modelId}`);

let text = "";
for await (const ev of agent.startTurn({
  directory,
  sessionId: null,
  model,
  extras: { agent: "agent" },
  parts: [{ type: "text", text: "Responde solo: hola" }],
})) {
  switch (ev.type) {
    case "session":
      console.log("session", ev.sessionId);
      break;
    case "text-delta":
      text += ev.text;
      process.stdout.write(ev.text);
      break;
    case "done":
      console.log("\ndone", JSON.stringify({ text }));
      break;
    case "error":
      console.error("\nerror", ev.message);
      process.exit(1);
    default:
      break;
  }
}
