#!/usr/bin/env node
// Sidecar HTTP de Antigravity CLI (`agy`). Spawn headless stream-json.
// Auth: sesión `agy` / Antigravity.app, o GEMINI_API_KEY. No lee el keyring.

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

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

const port = Number(argValue("--port") ?? "4126");
/** @type {Map<string, { child: import('node:child_process').ChildProcess, conversationId: string, write: (obj: object) => void, onLine: (fn: (ev: object) => void) => () => void }>} */
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
  const key =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    "";
  return key === "" ? undefined : key;
}

function agyPath() {
  const fromEnv = process.env.AGY_BIN?.trim();
  if (fromEnv) return fromEnv;
  const homeBin = path.join(os.homedir(), ".local", "bin", "agy");
  if (fs.existsSync(homeBin)) return homeBin;
  return "agy";
}

function agyCliInstalled() {
  if (process.env.AGY_BIN?.trim()) return true;
  return fs.existsSync(path.join(os.homedir(), ".local", "bin", "agy"));
}

function agyAppInstalled() {
  const home = os.homedir();
  return [
    "/Applications/Antigravity.app",
    path.join(home, "Applications", "Antigravity.app"),
  ].some((p) => fs.existsSync(p));
}

function spawnEnv() {
  const extra = path.join(os.homedir(), ".local", "bin");
  return {
    ...process.env,
    PATH: [extra, process.env.PATH ?? ""].join(path.delimiter),
  };
}

function runAgy(args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(agyPath(), args, {
      env: spawnEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, opts.timeoutMs ?? 25_000);
    child.stdout.on("data", (c) => {
      stdout += c.toString("utf8");
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: `${stderr}\n${err.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function notLoggedIn(text) {
  return /not logged into antigravity/i.test(text);
}

function startSessionProcess(opts) {
  const args = [
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--dangerously-skip-permissions",
  ];
  if (typeof opts.modelId === "string" && opts.modelId !== "") {
    args.push("--model", opts.modelId);
  }
  if (typeof opts.effort === "string" && opts.effort !== "") {
    args.push("--effort", opts.effort);
  }
  const child = spawn(agyPath(), args, {
    cwd: opts.cwd,
    env: spawnEnv(),
    stdio: ["pipe", "pipe", "pipe"],
  });
  const listeners = new Set();
  const rl = readline.createInterface({ input: child.stdout });
  child.stderr?.on("data", (c) => {
    process.stderr.write(c);
  });
  rl.on("line", (line) => {
    if (line.trim() === "") return;
    try {
      const ev = JSON.parse(line);
      for (const fn of listeners) fn(ev);
    } catch {
      // ignore non-JSON diagnostics that leaked to stdout
    }
  });
  function write(obj) {
    child.stdin.write(`${JSON.stringify(obj)}\n`);
  }
  function onLine(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function dispose() {
    rl.close();
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
  return { child, write, onLine, dispose };
}

function waitForInit(session, timeoutMs = 45_000) {
  return new Promise((resolve, reject) => {
    const finish = (err, id) => {
      clearTimeout(timer);
      off();
      session.child.off("exit", onExit);
      if (err != null) reject(err);
      else resolve(id);
    };
    const timer = setTimeout(() => {
      finish(new Error("Antigravity no inicializó la sesión a tiempo"));
    }, timeoutMs);
    const off = session.onLine((ev) => {
      if (ev?.event !== "init") return;
      const id =
        typeof ev.conversation_id === "string" ? ev.conversation_id : "";
      finish(null, id);
    });
    const onExit = (code) => {
      finish(new Error(`agy salió al arrancar (code ${code})`));
    };
    session.child.once("exit", onExit);
  });
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
      const cli = agyCliInstalled();
      const app = agyAppInstalled();
      const key = envKey() != null;
      const tokenFile = path.join(
        os.homedir(),
        ".gemini",
        "jetski-standalone-oauth-token",
      );
      let hasToken = false;
      try {
        hasToken = fs.statSync(tokenFile).size > 2;
      } catch {
        hasToken = false;
      }
      const authenticated = key || hasToken;
      let detail;
      if (!cli && !key) {
        detail = app
          ? "Veo Antigravity.app, pero el CLI `agy` no está en PATH. Instálalo o define GEMINI_API_KEY."
          : "No encuentro el CLI `agy`. Instálalo o define GEMINI_API_KEY.";
      } else if (!authenticated) {
        detail =
          "Antigravity no está autorizado. Abre `agy` e inicia sesión, o define GEMINI_API_KEY.";
      }
      sendJson(res, 200, {
        ok: true,
        version: "agy",
        authenticated: cli && authenticated,
        detail,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/models") {
      const result = await runAgy(["models"], { timeoutMs: 25_000 });
      const blob = `${result.stdout}\n${result.stderr}`;
      if (envKey() == null && notLoggedIn(blob)) {
        sendJson(res, 401, {
          error:
            "Antigravity no está autorizado. Abre `agy` e inicia sesión, o define GEMINI_API_KEY.",
          output: result.stdout,
        });
        return;
      }
      sendJson(res, 200, { output: result.stdout });
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/session") {
      const body = await readBody(req);
      const directory = body.directory;
      if (typeof directory !== "string" || directory === "") {
        sendJson(res, 400, { error: "directory requerido" });
        return;
      }
      const held = startSessionProcess({
        cwd: directory,
        modelId: body.modelId,
        effort: body.effort,
      });
      try {
        const conversationId = await waitForInit(held);
        const sessionId =
          conversationId !== "" ? conversationId : crypto.randomUUID();
        sessions.set(sessionId, { ...held, conversationId: sessionId });
        sendJson(res, 200, { sessionId });
      } catch (err) {
        held.dispose();
        throw err;
      }
      return;
    }

    const promptMatch = url.pathname.match(/^\/v1\/session\/([^/]+)\/prompt$/);
    if (req.method === "POST" && promptMatch) {
      const sessionId = decodeURIComponent(promptMatch[1]);
      const held = sessions.get(sessionId);
      if (held == null) {
        sendJson(res, 404, { error: "sesión Antigravity desconocida" });
        return;
      }
      const body = await readBody(req);
      const text = typeof body.text === "string" ? body.text : "";
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "access-control-allow-origin": "*",
      });
      const writeSse = (obj) => {
        res.write(`data: ${JSON.stringify(obj)}\n\n`);
      };
      writeSse({ event: "session", conversation_id: sessionId, type: "session" });
      const off = held.onLine((ev) => {
        writeSse(ev);
      });
      try {
        held.write({
          event: "user",
          message: { content: text },
        });
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            offWait();
            reject(new Error("Antigravity: timeout del turno"));
          }, 15 * 60_000);
          const offWait = held.onLine((ev) => {
            if (ev?.event !== "result") return;
            clearTimeout(timer);
            offWait();
            resolve(undefined);
          });
        });
      } catch (err) {
        writeSse({
          event: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        off();
        res.end();
      }
      return;
    }

    const abortMatch = url.pathname.match(/^\/v1\/session\/([^/]+)\/abort$/);
    if (req.method === "POST" && abortMatch) {
      const sessionId = decodeURIComponent(abortMatch[1]);
      const held = sessions.get(sessionId);
      if (held != null) {
        held.dispose();
        sessions.delete(sessionId);
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
  process.stdout.write(`steer-antigravity-serve ${HOST}:${port}\n`);
});
