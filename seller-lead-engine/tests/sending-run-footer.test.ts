import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runSend } from "../src/sending/run.ts";
import { MemoryTransport } from "../src/sending/transports.ts";
import { makeProspect, REPO, tempStores, testConfig } from "./helpers.ts";

// Proves the gate, not the footer builder, is what keeps a footerless email
// from leaving: the footer builder is swapped for a broken one that returns
// only a name, and the transport must never be called. (The lint checks the
// postal address, legal name and opt-out against config, not against
// buildFooter, so the broken builder cannot fool it.)

const broken = vi.hoisted(() => ({ footer: false }));
vi.mock("../src/compliance/footer.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/compliance/footer.ts")>();
  return {
    ...real,
    buildFooter: (...args: Parameters<typeof real.buildFooter>) => (broken.footer ? "Frank" : real.buildFooter(...args)),
  };
});

const TUE = "2026-11-10";

async function attempt() {
  const stores = tempStores();
  const p = makeProspect();
  stores.prospects.upsert([p]);
  const transport = new MemoryTransport();
  const report = await runSend(stores, testConfig(), { today: TUE, now: new Date(`${TUE}T13:00:00Z`), transport, templatesDir: path.join(REPO, "templates/sequence") });
  return { report, transport, stores };
}

describe("a message without its legal text", () => {
  afterEach(() => {
    broken.footer = false;
  });

  it("goes out when the footer and notice are intact", async () => {
    const { report, transport } = await attempt();
    expect(report.blocked).toEqual([]);
    expect(transport.delivered.length).toBe(1);
  });

  it("never reaches the transport without the footer (postal address, legal name, opt-out)", async () => {
    broken.footer = true;
    const { report, transport, stores } = await attempt();
    expect(transport.delivered).toEqual([]);
    expect(report.blocked[0]!.reasons).toEqual(
      expect.arrayContaining(["lint: footer is missing the postal address", 'lint: footer is missing the legal name "AMB Advisory Services LLC"', "lint: footer is missing the opt-out instruction"]),
    );
    expect(stores.touches.rows()[0]).toMatchObject({ status: "cancelled" });
  });
});
