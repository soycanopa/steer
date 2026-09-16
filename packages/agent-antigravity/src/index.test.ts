import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createAntigravityAgent } from "./index";

let server: http.Server | null = null;

async function listen(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<string> {
  server = http.createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr == null || typeof addr === "string") {
    throw new Error("no port");
  }
  return `http://127.0.0.1:${addr.port}`;
}

afterEach(async () => {
  if (server == null) return;
  const s = server;
  server = null;
  await new Promise<void>((resolve, reject) => {
    s.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("createAntigravityAgent", () => {
  it("health / listModels / startTurn against a fake sidecar", async () => {
    const baseUrl = await listen((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/v1/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, version: "test" }));
        return;
      }
      if (req.method === "GET" && url.pathname === "/v1/models") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            output: "gemini-fixture     Fixture Model\n",
          }),
        );
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/session") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ sessionId: "conv-test" }));
        return;
      }
      if (
        req.method === "POST" &&
        url.pathname === "/v1/session/conv-test/prompt"
      ) {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(
          `data: ${JSON.stringify({
            event: "step_update",
            step_update: {
              conversation_id: "conv-test",
              step_type: "agent_response",
              text_delta: "listo",
            },
          })}\n\n`,
        );
        res.write(
          `data: ${JSON.stringify({
            event: "result",
            result: { conversation_id: "conv-test", status: "SUCCESS" },
          })}\n\n`,
        );
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    });

    const agent = createAntigravityAgent({ baseUrl });
    const health = await agent.health();
    expect(health).toEqual({ ok: true, version: "test" });
    const models = await agent.listModels();
    expect(models[0]?.modelId).toBe("gemini-fixture");
    expect(models[0]?.adapterId).toBe("antigravity");

    const events = [];
    for await (const ev of agent.startTurn({
      directory: "/tmp/proj",
      sessionId: null,
      model: models[0]!,
      extras: {},
      parts: [{ type: "text", text: "hola" }],
    })) {
      events.push(ev);
    }
    expect(events).toContainEqual({ type: "session", sessionId: "conv-test" });
    expect(events).toContainEqual({ type: "text-delta", text: "listo" });
    expect(events).toContainEqual({ type: "done" });
  });
});
