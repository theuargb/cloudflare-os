import { describe, expect, it } from "vitest";
import {
  formatCurrentEnvironmentPrompt,
  type ChatBindingEntry,
} from "../src/agent";

describe("current agent environment", () => {
  it("announces replayed resources, gadgets, callbacks, and duplicate capabilities", () => {
    let bindings = new Map<string, ChatBindingEntry>([
      ["APP", { type: "workpiece", id: 1 }],
      ["DATABASE_DATA", { type: "workpiece", id: 2 }],
      ["DATABASE_DATA_2", { type: "workpiece", id: 3 }],
      ["PARAMS_1", { type: "value", messageSequence: 9 }],
    ]);

    let prompt = formatCurrentEnvironmentPrompt(bindings, new Set([1]));

    expect(prompt).toContain("env.APP — Gadget RPC stub");
    expect(prompt).toContain(
      "env.DATABASE_DATA — external resource capability",
    );
    expect(prompt).toContain(
      "env.DATABASE_DATA_2 — external resource capability",
    );
    expect(prompt).toContain("env.PARAMS_1 — agent callback arguments");
    expect(prompt).toContain("Use these exact names");
    expect(prompt).toContain("Keep separately listed capabilities distinct");
  });

  it("states when the current chat env is empty", () => {
    expect(formatCurrentEnvironmentPrompt(new Map(), new Set())).toContain(
      "currently has no bindings",
    );
  });
});
