// The Claude drafting path with Claude stubbed out: a failed call, or a draft
// that names a customer, must fall back to the reviewed copy and say why,
// never abort the request after the workbook is written (QA round 1 F51,
// F64). No network: claude() is replaced for this file only.

import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lintNames, protectedNames } from "../src/cim/copy.ts";
import { COPY_FIXTURE, draftCimCopy } from "../src/cim/narrative.ts";
import { CLAUDE_MODEL, fallbackOptions } from "../src/util/claude.ts";
import { defaultAssumptions } from "../src/model/assumptions.ts";
import { runModel } from "../src/model/engine.ts";
import { ridgelineDataset } from "./fixtures/sampleDataset.ts";
import { REPO, sampleRow } from "./helpers.ts";

const reply: { mode: "throw" | "named" | "cut" | "ok"; text?: string; params: Record<string, unknown>[] } = { mode: "throw", params: [] };

vi.mock("../src/util/claude.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/util/claude.ts")>();
  return {
    ...real,
    claudeAvailable: () => true,
    claude: () => ({
      beta: {
        messages: {
          stream: (params: Record<string, unknown>) => ({
            finalMessage: async () => {
              reply.params.push(params);
              if (reply.mode === "throw") throw new Error("529 overloaded_error");
              if (reply.mode === "cut") return { stop_reason: "max_tokens", content: [{ type: "text", text: "{" }] };
              return { stop_reason: "end_turn", content: [{ type: "text", text: reply.text! }] };
            },
          }),
        },
      },
    }),
  };
});

const firm = { name: "AMB Advisory Services", contact: "", email: "", phone: "" };
const draft = () => {
  const ds = ridgelineDataset();
  const row = sampleRow();
  return { ds, run: () => draftCimCopy({ row, notes: "", dataset: ds, model: runModel(ds, defaultAssumptions(ds, row)), firm, date: new Date("2026-09-28T12:00:00Z") }) };
};

describe("Claude drafting failures fall back to the reviewed copy", () => {
  beforeEach(() => {
    reply.mode = "throw";
    reply.params = [];
  });

  it("asks for structured output with only the server-side fallback beta, and lists row keys the way observations must quote them (QA round 3 F48, F56)", async () => {
    reply.mode = "ok";
    const fixture = JSON.parse(fs.readFileSync(path.join(REPO, "samples/project-ridgeline", COPY_FIXTURE), "utf8")) as { copy: unknown };
    reply.text = JSON.stringify(fixture.copy);
    const res = await draft().run();
    expect(res.source).toBe("claude");
    const params = reply.params[0]!;
    expect(params.model).toBe(CLAUDE_MODEL);
    // output_config.format is generally available: no structured-outputs beta header, which an unknown date would make the API reject.
    expect(params.betas).toEqual(fallbackOptions().betas);
    expect((params.output_config as { format?: unknown }).format).toBeDefined();
    const prompt = JSON.stringify(params.messages);
    expect(prompt).toMatch(/is\.revenue = Total revenue|is\.[a-z_.]+ = [A-Z]/);
    expect(prompt).not.toMatch(/is\.[a-z_.]+ \([A-Z]/);
  });

  it("an API error falls back to the fixture and records why", async () => {
    const res = await draft().run();
    expect(res.source).toBe("fixture");
    expect(res.fallback).toMatch(/^Claude's draft was not used \(529 overloaded_error\)/);
  });

  it("a cut-off draft falls back too", async () => {
    reply.mode = "cut";
    const res = await draft().run();
    expect(res.source).toBe("fixture");
    expect(res.fallback).toMatch(/cut off \(max_tokens\)/);
  });

  it("a draft that names a listed customer is refused, whatever its other merits", async () => {
    const { ds, run } = draft();
    const customer = ds.customers!.customers.find((c) => c.name)!.name!;
    reply.mode = "named";
    // The reviewed copy with one customer named in an observation: otherwise a valid draft.
    const fixture = JSON.parse(fs.readFileSync(path.join(REPO, "samples/project-ridgeline", COPY_FIXTURE), "utf8")) as { copy: unknown };
    const named = JSON.stringify(fixture.copy).replace(/"lead":"([^"]*)"/, `"lead":"$1 ${customer} included"`);
    expect(named).toContain(customer);
    reply.text = named;
    const res = await run();
    expect(res.source).toBe("fixture");
    expect(res.fallback).toContain(`names "${customer}"`);
  });
});

describe("protected names (guide 1.4, Q12)", () => {
  it("covers every listed customer and staff outside management, not the owner or the management roster", () => {
    const ds = ridgelineDataset();
    const names = protectedNames(ds);
    for (const c of ds.customers!.customers) if (c.name) expect(names).toContain(c.name);
    for (const e of ds.payroll!.employees.filter((x) => x.name && !x.isOwner && !x.isManagement)) {
      if (!(ds.intake?.management ?? []).some((m) => m.name === e.name)) expect(names).toContain(e.name);
    }
    expect(names).not.toContain(ds.recastInputs!.owners[0]!.name);
    for (const m of ds.intake?.management ?? []) expect(names).not.toContain(m.name);
    expect(lintNames({ open_questions: [], s1_1: { title: `Work for ${names[0]} grew`, observations: [] } } as never, names)).toHaveLength(1);
  });
});
