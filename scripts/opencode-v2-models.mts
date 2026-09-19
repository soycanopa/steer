// Probe del adapter contra el service compartido (no se commitea).
import { createOpencodeAgent } from "../packages/agent-opencode/src/index";

const [baseUrl, password] = process.argv.slice(2);
const agent = createOpencodeAgent({ baseUrl });
agent.setAuth({ username: "opencode", password });

const health = await agent.health();
console.log("health:", JSON.stringify(health));

const models = await agent.listModels();
console.log("listModels:", models.length);
for (const m of models.slice(0, 8)) {
  console.log(" ", `${m.providerId}/${m.modelId}`, "reasoning=" + m.capabilities.reasoning);
}
