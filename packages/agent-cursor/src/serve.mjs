#!/usr/bin/env node
// Sidecar HTTP del SDK Cursor (local). Solo lo spawnea el host Tauri.
// Auth: CURSOR_API_KEY, o ~/.cursor/sdk/auth.json, o Cursor.auth.login().
// No lee tokens de Cursor.app (el SDK no lo soporta).

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const HOST = "127.0.0.1";
const CORS = [
  "http://localhost:1420",
  "http://127.0.0.1:1420",
  "tauri://localhost",
  "https://tauri.localhost",
];

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

const port = Number(argValue("--port") ?? "4106");
const sessions = new Map();

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw === "") {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function envKey() {
  const key = process.env.CURSOR_API_KEY?.trim() ?? "";
  return key === "" ? undefined : key;
}

function cursorAppInstalled() {
  const home = os.homedir();
  const candidates = [
    "/Applications/Cursor.app",
    path.join(home, "Applications/Cursor.app"),
  ];
  return candidates.some((p) => fs.existsSync(p));
}

async function loadSdk() {
  return import("@cursor/sdk");
}

function sdkOpts(apiKey) {
  return apiKey != null ? { apiKey } : {};
}

function modelParams(extras) {
  const raw = extras?.params;
  if (!Array.isArray(raw)) return undefined;
  const out = [];
  for (const p of raw) {
    if (
      p != null &&
      typeof p === "object" &&
      typeof p.id === "string" &&
      typeof p.value === "string"
    ) {
      out.push({ id: p.id, value: p.value });
    }
  }
  return out.length > 0 ? out : undefined;
}

async function authSnapshot() {
  if (envKey() != null) {
    return {
      authenticated: true,
      via: "env",
      cursorApp: cursorAppInstalled(),
    };
  }
  const { Cursor } = await loadSdk();
  const status = await Cursor.auth.status();
  if (status.status === "logged-in") {
    return {
      authenticated: true,
      via: "sdk",
      email: status.email,
      cursorApp: cursorAppInstalled(),
    };
  }
  return {
    authenticated: false,
    via: "none",
    cursorApp: cursorAppInstalled(),
  };
}

async function ensureLoggedIn() {
  const key = envKey();
  if (key != null) return { apiKey: key };
  const { Cursor } = await loadSdk();
  const status = await Cursor.auth.status();
  if (status.status === "logged-in") {
    return {};
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 120_000);
  try {
    await Cursor.auth.login({ signal: ac.signal });
    return {};
  } finally {
    clearTimeout(timer);
  }
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin":
        origin && CORS.includes(origin) ? origin : "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${HOST}`);

  try {
    if (req.method === "GET" && url.pathname === "/v1/health") {
      try {
        const snap = await authSnapshot();
        const detail = snap.authenticated
          ? undefined
          : snap.cursorApp
            ? "Cursor está instalado. Hay que autorizar Steer una vez (abre el navegador)."
            : "No veo Cursor.app. Instálalo o define CURSOR_API_KEY.";
        sendJson(res, 200, {
          ok: true,
          version: "cursor-sdk",
          authenticated: snap.authenticated,
          email: snap.email,
          cursorApp: snap.cursorApp,
          detail,
        });
      } catch (err) {
        sendJson(res, 200, {
          ok: true,
          version: "cursor-sdk",
          authenticated: false,
          cursorApp: cursorAppInstalled(),
          detail: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/login") {
      await ensureLoggedIn();
      const snap = await authSnapshot();
      sendJson(res, 200, {
        ok: snap.authenticated,
        authenticated: snap.authenticated,
        email: snap.email,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/models") {
      const creds = await ensureLoggedIn();
      const { Cursor } = await loadSdk();
      const models = await Cursor.models.list(sdkOpts(creds.apiKey));
      sendJson(res, 200, { models });
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/session") {
      const creds = await ensureLoggedIn();
      const body = await readBody(req);
      const directory = body.directory;
      const modelId = body.modelId;
      if (typeof directory !== "string" || directory === "") {
        sendJson(res, 400, { error: "directory requerido" });
        return;
      }
      if (typeof modelId !== "string" || modelId === "") {
        sendJson(res, 400, { error: "modelId requerido" });
        return;
      }
      const { Agent } = await loadSdk();
      const params = modelParams(body.extras);
      const agent = await Agent.create({
        ...sdkOpts(creds.apiKey),
        model: params != null ? { id: modelId, params } : { id: modelId },
        local: { cwd: directory },
      });
      sessions.set(agent.agentId, { agent, run: null });
      sendJson(res, 200, { sessionId: agent.agentId });
      return;
    }

    const promptMatch = url.pathname.match(
      /^\/v1\/session\/([^/]+)\/prompt$/,
    );
    if (req.method === "POST" && promptMatch) {
      const sessionId = decodeURIComponent(promptMatch[1]);
      const held = sessions.get(sessionId);
      if (held == null) {
        sendJson(res, 404, { error: "sesión Cursor desconocida" });
        return;
      }
      const body = await readBody(req);
      const text = typeof body.text === "string" ? body.text : "";
      const images = Array.isArray(body.images) ? body.images : [];
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "access-control-allow-origin": "*",
      });
      const write = (obj) => {
        res.write(`data: ${JSON.stringify(obj)}\n\n`);
      };
      const message = images.length > 0 ? { text, images } : text;
      const extras = body.extras;
      const params = modelParams(extras);
      const sendOpts =
        params != null && typeof body.modelId === "string"
          ? { model: { id: body.modelId, params } }
          : undefined;
      const run =
        sendOpts != null
          ? await held.agent.send(message, sendOpts)
          : await held.agent.send(message);
      held.run = run;
      try {
        for await (const event of run.stream()) {
          write(event);
        }
        const result = await run.wait();
        if (result.status === "error") {
          write({
            type: "error",
            text: result.error?.message ?? "Cursor: el turno falló",
          });
        } else if (result.status === "cancelled") {
          write({ type: "error", text: "Turno abortado" });
        } else {
          write({ type: "done" });
        }
      } catch (err) {
        write({
          type: "error",
          text: err instanceof Error ? err.message : String(err),
        });
      } finally {
        held.run = null;
        res.end();
      }
      return;
    }

    const abortMatch = url.pathname.match(/^\/v1\/session\/([^/]+)\/abort$/);
    if (req.method === "POST" && abortMatch) {
      const sessionId = decodeURIComponent(abortMatch[1]);
      const held = sessions.get(sessionId);
      const run = held?.run;
      if (
        run != null &&
        typeof run.supports === "function" &&
        run.supports("cancel")
      ) {
        await run.cancel();
      }
      sendJson(res, 204, {});
      return;
    }

    sendJson(res, 404, { error: "not found" });
  } catch (err) {
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

server.listen(port, HOST, () => {
  process.stdout.write(`steer-cursor-serve ${HOST}:${port}\n`);
});
