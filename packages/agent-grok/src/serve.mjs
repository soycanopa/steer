#!/usr/bin/env node
// Sidecar HTTP de Grok Build. El host Tauri spawnea este proceso.
// Auth: XAI_API_KEY o `grok login` (credenciales del CLI). No lee tokens de Grok Bot.app.

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { extractStreamText } from "./extract-stream-text.mjs";

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

const port = Number(argValue("--port") ?? "4116");
/** @type {Map<string, { child: import('node:child_process').ChildProcess, request: (method: string, params: object, timeoutMs?: number) => Promise<unknown>, sessionId: string }>} */
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
  const key = process.env.XAI_API_KEY?.trim() ?? "";
  return key === "" ? undefined : key;
}

function grokHomeBin() {
  return path.join(os.homedir(), ".grok", "bin", "grok");
}

function grokPath() {
  const fromEnv = process.env.GROK_BIN?.trim();
  if (fromEnv) return fromEnv;
  const homeBin = grokHomeBin();
  if (fs.existsSync(homeBin)) return homeBin;
  return "grok";
}

function grokCliInstalled() {
  if (process.env.GROK_BIN?.trim()) return true;
  if (fs.existsSync(grokHomeBin())) return true;
  return false;
}

function grokAppInstalled() {
  const home = os.homedir();
  const candidates = [
    "/Applications/Grok Bot.app",
    "/Applications/Grok.app",
    path.join(home, "Applications", "Grok Bot.app"),
    path.join(home, "Applications", "Grok.app"),
  ];
  return candidates.some((p) => fs.existsSync(p));
}

function grokAuthFile() {
  return path.join(os.homedir(), ".grok", "auth.json");
}

function cliLoggedIn() {
  const auth = grokAuthFile();
  try {
    return fs.statSync(auth).size > 2;
  } catch {
    return false;
  }
}

function readModelsCatalog() {
  const cachePath = path.join(os.homedir(), ".grok", "models_cache.json");
  try {
    const raw = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    const models = raw?.models;
    if (models == null || typeof models !== "object") return [];
    const catalog = [];
    for (const [id, entry] of Object.entries(models)) {
      if (id === "") continue;
      const info = entry?.info ?? {};
      const efforts = Array.isArray(info.reasoning_efforts)
        ? info.reasoning_efforts
            .map((e) => ({
              value: typeof e?.value === "string" ? e.value : e?.id,
              label: typeof e?.label === "string" ? e.label : undefined,
              isDefault: e?.default === true,
            }))
            .filter((e) => typeof e.value === "string" && e.value !== "")
        : undefined;
      catalog.push({
        id,
        label:
          typeof info.name === "string" && info.name !== "" ? info.name : id,
        hidden: info.hidden === true,
        supportsReasoningEffort: info.supports_reasoning_effort === true,
        reasoningEfforts: efforts,
      });
    }
    return catalog;
  } catch {
    return [];
  }
}

function wireEffort(modelId, effort) {
  if (typeof effort !== "string" || effort === "") return undefined;
  const model = readModelsCatalog().find((m) => m.id === modelId);
  const values = (model?.reasoningEfforts ?? []).map((e) => e.value);
  if (values.includes(effort)) return effort;
  if (effort === "max" && values.includes("xhigh")) return "xhigh";
  if (effort === "max" && values.includes("high")) return "high";
  return effort;
}

function spawnEnv() {
  const homeBin = path.join(os.homedir(), ".grok", "bin");
  const pathParts = [homeBin, process.env.PATH ?? ""].filter((p) => p !== "");
  return {
    ...process.env,
    PATH: pathParts.join(path.delimiter),
    GROK_DISABLE_AUTOUPDATER: "1",
  };
}

function runGrok(args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(grokPath(), args, {
      env: spawnEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, opts.timeoutMs ?? 20_000);
    child.stdout.on("data", (c) => {
      stdout += c.toString("utf8");
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        code: 1,
        stdout,
        stderr: `${stderr}\n${err.message}`,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function looksLoggedIn(stdout) {
  const text = stdout.replace(/\u001b\[[0-9;]*m/g, "");
  if (/logged in/i.test(text)) return true;
  if (/Available models:/i.test(text)) return true;
  if (/Default model:/i.test(text)) return true;
  return false;
}

async function modelsSnapshot() {
  const key = envKey();
  const result = await runGrok(["--no-auto-update", "models"]);
  const missing =
    /ENOENT/i.test(result.stderr) || /not found/i.test(result.stderr);
  if (missing && !grokCliInstalled()) {
    return {
      authenticated: false,
      grokCli: false,
      grokApp: grokAppInstalled(),
      output: "",
      detail: grokAppInstalled()
        ? "Veo Grok.app, pero el CLI `grok` no está en PATH. Instálalo o define XAI_API_KEY."
        : "No encuentro el CLI `grok`. Instálalo o define XAI_API_KEY.",
    };
  }
  const authenticated = key != null || looksLoggedIn(result.stdout);
  return {
    authenticated,
    grokCli: true,
    grokApp: grokAppInstalled(),
    output: result.stdout,
    version: "grok-cli",
    detail: authenticated
      ? undefined
      : "Grok no está autorizado. Ejecuta `grok login` o define XAI_API_KEY.",
  };
}

function acpUpdateKind(update) {
  if (typeof update.sessionUpdate === "string") return update.sessionUpdate;
  if (typeof update.session_update === "string") return update.session_update;
  return "";
}

function isThoughtKind(kind) {
  return (
    kind === "agent_thought_chunk" ||
    kind === "agent_thought" ||
    kind === "thought_chunk" ||
    kind === "thought"
  );
}

function acpToStream(update) {
  if (update == null || typeof update !== "object") return null;
  const kind = acpUpdateKind(update);
  if (kind === "agent_message_chunk" || kind === "agent_message") {
    const text = extractStreamText(update.content ?? update);
    if (text !== "") return { type: "text", data: text };
    return null;
  }
  if (isThoughtKind(kind)) {
    const text = extractStreamText(
      update.content ?? update.text ?? update.thought ?? update,
    );
    if (text !== "") return { type: "thought", data: text };
    return null;
  }
  if (kind === "tool_call") {
    return {
      type: "tool_call",
      toolCallId: update.toolCallId,
      toolName: update.title ?? update.kind,
      status: update.status ?? "in_progress",
      rawInput: update.rawInput,
    };
  }
  if (kind === "usage_update") {
    const used = Number(update.used);
    const size = Number(update.size);
    if (!Number.isFinite(used) || used <= 0) return null;
    return {
      type: "usage",
      contextTokens: used,
      ...(Number.isFinite(size) && size > 0 ? { contextWindow: size } : {}),
    };
  }

  if (kind === "tool_call_update") {
    return {
      type: "tool_call_update",
      toolCallId: update.toolCallId,
      toolName: update.title ?? update.kind,
      status: update.status,
      rawOutput: update.rawOutput,
    };
  }
  return null;
}

/** Tope del ACP: no inundar el contexto del agente con archivos enormes. */
const READ_TEXT_FILE_MAX = 256 * 1024;

function sendToAgent(child, payload) {
  try {
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  } catch {
    // stdin muerto: el turno va a fallar por su lado de todos modos.
  }
}

function respondResult(child, id, result) {
  sendToAgent(child, { jsonrpc: "2.0", id, result: result ?? {} });
}

function respondError(child, id, code, message) {
  sendToAgent(child, {
    jsonrpc: "2.0",
    id,
    error: { code, message: String(message).slice(0, 300) },
  });
}

/** fs/read_text_file delegado por el agente ({path, line?, limit?}). */
function readTextFileContent(params) {
  if (typeof params?.path !== "string" || params.path === "") {
    throw new Error("fs/read_text_file: path requerido");
  }
  let content = fs.readFileSync(params.path, "utf8");
  if (typeof params.line === "number" || typeof params.limit === "number") {
    const lines = content.split("\n");
    const start = typeof params.line === "number" ? Math.max(0, params.line) : 0;
    const limit =
      typeof params.limit === "number" ? params.limit : lines.length - start;
    content = lines.slice(start, start + limit).join("\n");
  }
  if (content.length > READ_TEXT_FILE_MAX) {
    content = content.slice(0, READ_TEXT_FILE_MAX);
  }
  return content;
}

/** session/request_permission: el CLI corre con --always-approve; si aun
 * así pregunta, elegir la primera opción "allow*" en vez de colgar. */
function allowPermission(params) {
  const options = Array.isArray(params?.options) ? params.options : [];
  const allow = options.find(
    (o) => typeof o?.kind === "string" && o.kind.startsWith("allow"),
  );
  const picked = allow ?? options[0];
  return picked != null && picked.optionId != null
    ? { outcome: "selected", optionId: picked.optionId }
    : { outcome: "cancelled" };
}

async function answerAgentRequest(child, message) {
  const { id, method, params } = message;
  try {
    if (method === "fs/read_text_file") {
      respondResult(child, id, { content: readTextFileContent(params) });
      return;
    }
    if (method === "fs/write_text_file") {
      if (typeof params?.path !== "string" || params.path === "") {
        throw new Error("fs/write_text_file: path requerido");
      }
      // El agente-producto escribe el proyecto abierto: ese es el flujo Steer.
      fs.writeFileSync(params.path, typeof params.content === "string" ? params.content : "", "utf8");
      respondResult(child, id, {});
      return;
    }
    if (method === "session/request_permission") {
      respondResult(child, id, allowPermission(params));
      return;
    }
    // Terminal y demás no implementados: error visible, no un hang.
    respondError(child, id, -32601, `Method not found: ${method}`);
  } catch (err) {
    respondError(child, id, -32603, err instanceof Error ? err.message : String(err));
  }
}

function startAcp(opts) {
  const args = ["--no-auto-update"];
  if (typeof opts.modelId === "string" && opts.modelId !== "") {
    args.push("-m", opts.modelId);
  }
  if (typeof opts.effort === "string" && opts.effort !== "") {
    args.push("--effort", opts.effort);
  }
  args.push("agent", "--always-approve", "stdio");

  const child = spawn(grokPath(), args, {
    cwd: opts.cwd,
    env: spawnEnv(),
    stdio: ["pipe", "pipe", "pipe"],
  });

  const pending = new Map();
  let nextId = 1;
  const listeners = new Set();

  const rl = readline.createInterface({ input: child.stdout });
  child.stderr?.on("data", (c) => {
    process.stderr.write(c);
  });

  rl.on("line", (line) => {
    if (line.trim() === "") return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.method === "session/update") {
      const projected = acpToStream(message.params?.update ?? message.params);
      for (const fn of listeners) fn(projected, message.params);
      return;
    }
    // Request del agente hacia este cliente ACP (fs delegado, permisos).
    // Sin respuesta el agente bloquea para siempre: siempre hay que
    // contestar, aunque sea con error.
    if (message.method != null && message.id != null) {
      void answerAgentRequest(child, message);
      return;
    }
    const waiter = pending.get(message.id);
    if (waiter == null) return;
    pending.delete(message.id);
    if (message.error) {
      waiter.reject(
        new Error(message.error.message ?? JSON.stringify(message.error)),
      );
    } else {
      waiter.resolve(message.result ?? {});
    }
  });

  function request(method, params, timeoutMs = 30_000) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      pending.set(id, {
        resolve(result) {
          clearTimeout(timer);
          resolve(result);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        },
      });
      child.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
      );
    });
  }

  function onUpdate(fn) {
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

  return { child, request, onUpdate, dispose };
}

async function handshake(acp) {
  const init = await acp.request("initialize", {
    protocolVersion: 1,
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
    },
  });
  const authMethods = new Set(
    (init.authMethods ?? []).map((method) => method.id),
  );
  const methodId =
    envKey() != null && authMethods.has("xai.api_key")
      ? "xai.api_key"
      : authMethods.has("cached_token")
        ? "cached_token"
        : authMethods.has("xai.api_key")
          ? "xai.api_key"
          : null;
  if (methodId == null) {
    throw new Error("Run `grok login` first, or set XAI_API_KEY.");
  }
  await acp.request("authenticate", { methodId, _meta: { headless: true } });
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
      const authenticated = envKey() != null || cliLoggedIn();
      const grokCli = grokCliInstalled();
      const grokApp = grokAppInstalled();
      let detail;
      if (!authenticated) {
        detail = grokCli
          ? "Grok no está autorizado. Ejecuta `grok login` o define XAI_API_KEY."
          : grokApp
            ? "Veo Grok.app, pero el CLI `grok` no está logueado. Ejecuta `grok login` o define XAI_API_KEY."
            : "No encuentro el CLI `grok`. Instálalo o define XAI_API_KEY.";
      }
      sendJson(res, 200, {
        ok: true,
        version: "grok-cli",
        authenticated,
        grokCli,
        grokApp,
        detail,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/models") {
      const snap = await modelsSnapshot();
      if (!snap.authenticated) {
        sendJson(res, 401, {
          error: snap.detail ?? "Grok no autorizado",
          output: snap.output,
        });
        return;
      }
      sendJson(res, 200, { output: snap.output, catalog: readModelsCatalog() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/session") {
      const body = await readBody(req);
      const directory = body.directory;
      if (typeof directory !== "string" || directory === "") {
        sendJson(res, 400, { error: "directory requerido" });
        return;
      }
      const acp = startAcp({
        cwd: directory,
        modelId: body.modelId,
        effort: wireEffort(body.modelId, body.effort),
      });
      try {
        await handshake(acp);
        const created = await acp.request("session/new", {
          cwd: directory,
          mcpServers: [],
        });
        const sessionId =
          typeof created.sessionId === "string" ? created.sessionId : "";
        if (sessionId === "") {
          throw new Error("Grok ACP no devolvió sessionId");
        }
        sessions.set(sessionId, { ...acp, sessionId });
        sendJson(res, 200, { sessionId });
      } catch (err) {
        acp.dispose();
        throw err;
      }
      return;
    }

    const promptMatch = url.pathname.match(/^\/v1\/session\/([^/]+)\/prompt$/);
    if (req.method === "POST" && promptMatch) {
      const sessionId = decodeURIComponent(promptMatch[1]);
      const held = sessions.get(sessionId);
      if (held == null) {
        sendJson(res, 404, { error: "sesión Grok desconocida" });
        return;
      }
      const body = await readBody(req);
      const text = typeof body.text === "string" ? body.text : "";
      const images = Array.isArray(body.images) ? body.images : [];
      const prompt = [{ type: "text", text }];
      for (const img of images) {
        if (
          img != null &&
          typeof img === "object" &&
          typeof img.data === "string" &&
          typeof img.mimeType === "string"
        ) {
          prompt.push({
            type: "image",
            mimeType: img.mimeType,
            data: img.data,
          });
        }
      }
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "access-control-allow-origin": "*",
      });
      const write = (obj) => {
        res.write(`data: ${JSON.stringify(obj)}\n\n`);
      };
      write({ type: "session", sessionId });
      const off = held.onUpdate((projected) => {
        if (projected != null) write({ ...projected, sessionId });
      });
      try {
        const params = { sessionId: held.sessionId, prompt };
        if (typeof body.effort === "string" && body.effort !== "") {
          params._meta = {
            effort: wireEffort(body.modelId, body.effort) ?? body.effort,
          };
        }
        await held.request("session/prompt", params, 15 * 60_000);
        write({ type: "end", sessionId });
      } catch (err) {
        write({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
          sessionId,
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
        try {
          await held.request("session/cancel", { sessionId: held.sessionId }, 5_000);
        } catch {
          held.dispose();
          sessions.delete(sessionId);
        }
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
  process.stdout.write(`steer-grok-serve ${HOST}:${port}\n`);
});
