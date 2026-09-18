import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAgySessionArgs, workspaceMismatch } from "./agy-args.mjs";

describe("buildAgySessionArgs", () => {
  it("registers the project with --add-dir", () => {
    const { args, cwd } = buildAgySessionArgs({
      cwd: "/tmp/my-app",
      modelId: "gemini-3.8-flash-high",
      effort: "high",
    });
    expect(cwd).toBe(path.resolve("/tmp/my-app"));
    expect(args).toEqual([
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--dangerously-skip-permissions",
      "--add-dir",
      path.resolve("/tmp/my-app"),
      "--model",
      "gemini-3.8-flash-high",
      "--effort",
      "high",
    ]);
  });
});

describe("workspaceMismatch", () => {
  it("accepts the requested project", () => {
    expect(workspaceMismatch("/tmp/app", "/tmp/app")).toBeNull();
  });

  it("rejects the agy scratch dir", () => {
    const msg = workspaceMismatch(
      "/Users/x/.gemini/antigravity-cli/scratch",
      "/tmp/app",
    );
    expect(msg).toMatch(/scratch/);
    expect(msg).toMatch(/tmp/);
  });
});
