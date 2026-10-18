// The Claude classification path with Claude stubbed out (the pattern of
// amb-material-bot/tests/cim-fallback.test.ts): the request shape, the
// facts conversion, opt-outs that rules catch never reaching Claude, and a
// failed or refused call falling back to the keyword classifier. No network:
// claude() is replaced for this file only.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyReply, type ReplyWire } from "../src/replies/classify.ts";
import { CLAUDE_MODEL, fallbackOptions } from "../src/util/claude.ts";
import { inbound } from "./fixtures/replies/messages.ts";
import { makeLead, makeProspect, testConfig } from "./helpers.ts";

const reply: { mode: "ok" | "throw" | "refusal" | "unparsed"; wire?: Partial<ReplyWire>; params: Record<string, unknown>[] } = { mode: "ok", params: [] };

const blank: ReplyWire = {
  class: "interested",
  opt_out: false,
  complaint: false,
  question: null,
  revenue: null,
  revenue_band: null,
  sde: null,
  ebitda: null,
  employees: null,
  years_owned: null,
  owner_hours_per_week: null,
  recurring_revenue_pct: null,
  top_customer_pct: null,
  owns_real_estate: null,
  license_holder: null,
  timeline: null,
  motivation: null,
  motivation_detail: null,
  wants_readiness_check: null,
  notes: "Owner wants the check.",
};

vi.mock("../src/util/claude.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/util/claude.ts")>();
  return {
    ...real,
    claudeAvailable: () => true,
    claude: () => ({
      beta: {
        messages: {
          parse: async (params: Record<string, unknown>) => {
            reply.params.push(params);
            if (reply.mode === "throw") throw new Error("529 overloaded_error");
            if (reply.mode === "refusal") return { stop_reason: "refusal", parsed_output: null };
            if (reply.mode === "unparsed") return { stop_reason: "end_turn", parsed_output: null };
            return { stop_reason: "end_turn", parsed_output: { ...blank, ...reply.wire } };
          },
        },
      },
    }),
  };
});

const prospect = makeProspect({ business_name: "Example Air Inc", city: "Tampa" });
const ctx = { prospect, lead: makeLead(prospect, { revenue_band: "$1M-$2M" }), config: testConfig() };

describe("classifyReply with Claude", () => {
  beforeEach(() => {
    reply.mode = "ok";
    reply.wire = {};
    reply.params = [];
  });

  it("asks for structured output the amb-material-bot way: parse, fallback beta, adaptive thinking, medium effort", async () => {
    await classifyReply(inbound({ text: "Yes, tell me more." }), ctx);
    const params = reply.params[0]!;
    expect(params.model).toBe(CLAUDE_MODEL);
    expect(params.betas).toEqual(fallbackOptions().betas);
    expect(params.fallbacks).toBe("default");
    expect(params.thinking).toEqual({ type: "adaptive" });
    const oc = params.output_config as { effort: string; format?: unknown };
    expect(oc.effort).toBe("medium");
    expect(oc.format).toBeDefined();
    const system = String(params.system);
    expect(system).toMatch(/Extract only facts the owner states/);
    expect(system).toMatch(/Never infer/);
    expect(system).toMatch(/any opt-out wording.*as unsubscribe/i);
    const prompt = JSON.stringify(params.messages);
    expect(prompt).toContain("Example Air Inc (HVAC company, Tampa)");
    expect(prompt).toContain("revenue_band: $1M-$2M");
    expect(prompt).toContain("Yes, tell me more.");
  });

  it("returns Claude's class and only the facts the owner stated", async () => {
    reply.wire = { class: "interested", revenue: 1_400_000, timeline: "6-12m", motivation: "retirement", motivation_detail: "ready to retire", wants_readiness_check: "Y" };
    const c = await classifyReply(inbound({ text: "Yes. We did $1.4M last year and I want to retire next year." }), ctx);
    expect(c).toEqual({
      class: "interested",
      classifier: "claude",
      optOut: false,
      complaint: false,
      facts: { revenue: 1_400_000, timeline: "6-12m", motivation: "retirement", motivation_detail: "ready to retire", wants_readiness_check: "Y" },
      notes: "Owner wants the check.",
    });
  });

  it("sends only the new text to Claude, not the quoted history", async () => {
    await classifyReply(inbound({ text: "Yes please.\n\nOn Mon, Oct 12, 2026 at 9:00 AM Frank wrote:\n> We have a buyer" }), ctx);
    const prompt = JSON.stringify(reply.params[0]!.messages);
    expect(prompt).toContain("Yes please.");
    expect(prompt).not.toContain("We have a buyer");
  });

  it("never calls Claude for an opt-out the rules catch", async () => {
    reply.wire = { class: "interested" };
    const c = await classifyReply(inbound({ text: "Yes, but please take me off your list." }), ctx);
    expect(c).toMatchObject({ class: "unsubscribe", optOut: true, classifier: "rules" });
    expect(reply.params).toEqual([]);
  });

  it("treats an opt-out Claude flags under another class as an unsubscribe", async () => {
    reply.wire = { class: "not_interested", opt_out: true };
    const c = await classifyReply(inbound({ text: "I would prefer you go away and find someone else to bother" }), ctx);
    expect(c).toMatchObject({ class: "unsubscribe", optOut: true, classifier: "claude" });
  });

  it("falls back to keywords and says why when the call fails, is refused or does not parse", async () => {
    for (const [mode, why] of [
      ["throw", /529 overloaded_error/],
      ["refusal", /declined/],
      ["unparsed", /Could not parse/],
    ] as const) {
      reply.mode = mode;
      const c = await classifyReply(inbound({ text: "Sure, sounds good." }), ctx);
      expect(c.class).toBe("interested");
      expect(c.classifier).toBe("rules");
      expect(c.notes).toMatch(why);
      expect(c.notes).toMatch(/keyword fallback/);
    }
  });
});
