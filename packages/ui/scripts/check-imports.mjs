#!/usr/bin/env node
// Guardrail P0: packages/ui no importa adapters (AGENTS.md / IMPLEMENTATION §5).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "../src");
const forbidden = /@steer\/agent-/;
let failed = false;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walk(p);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(extname(p))) continue;
    const text = readFileSync(p, "utf8");
    if (forbidden.test(text)) {
      console.error(`forbidden adapter import: ${p}`);
      failed = true;
    }
  }
}

walk(root);
if (failed) process.exit(1);
