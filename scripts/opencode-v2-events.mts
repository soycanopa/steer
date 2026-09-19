// Dump crudo de eventos v2 durante un turno (no se commitea).
const [baseUrl, password] = process.argv.slice(2);
const headers: Record<string, string> = {
  "content-type": "application/json",
  ...(password ? { authorization: `Basic ${btoa(`opencode:${password}`)}` } : {}),
};

const ac = new AbortController();
const seen: string[] = [];
(async () => {
  const res = await fetch(`${baseUrl}/api/event`, {
    headers: { accept: "text/event-stream", authorization: headers.authorization ?? "" },
    signal: ac.signal,
  });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i = buf.indexOf("\n\n");
    while (i !== -1) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data:")) {
          try {
            const e = JSON.parse(line.slice(5));
            if (e.type !== "server.connected") {
              seen.push(e.type);
              const sid = e.data?.sessionID;
              console.log("EVT", e.type, sid ? `(${sid})` : "");
            }
          } catch {}
        }
      }
      i = buf.indexOf("\n\n");
    }
  }
})();

const created = await fetch(`${baseUrl}/api/session`, {
  method: "POST",
  headers,
  body: JSON.stringify({ title: "Steer-probe2" }),
}).then((r) => r.json());
const sid = created.data.id;
console.log("SESSION", sid);

await new Promise((r) => setTimeout(r, 400));
await fetch(`${baseUrl}/api/session/${sid}/prompt`, {
  method: "POST",
  headers,
  body: JSON.stringify({ text: "Reply with exactly: OK" }),
}).then((r) => r.json());

await new Promise((r) => setTimeout(r, 30000));
console.log("---- tipos vistos:", [...new Set(seen)].join(", "));
ac.abort();
process.exit(0);
