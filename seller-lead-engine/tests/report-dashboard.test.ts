import { describe, expect, it } from "vitest";
import path from "node:path";
import { loadConfig } from "../src/config.ts";
import { runDemo } from "../src/demo.ts";
import { dashboardData, writeDashboardData } from "../src/report/dashboard.ts";
import { openStores } from "../src/store/index.ts";
import { tmpDir } from "./helpers.ts";

describe("dashboard data", () => {
  it("exports the funnel, headline numbers and tables from the demo, with no contact details or age hints", async () => {
    const dataDir = tmpDir("lead-engine-dash-");
    await runDemo({ log: () => {}, today: "2026-10-18", now: new Date("2026-10-18T12:00:00Z"), dataDir });
    const stores = openStores(dataDir);
    const config = loadConfig(path.join(dataDir, "engine.config.json"));
    const data = dashboardData(stores, config, { today: "2026-10-21" });

    const counts = data.funnel.map((f) => f.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a)); // each step is a subset of the one before
    expect(data.summary.map((s) => s.metric)).toEqual(["warm", "in_conversation", "contacted", "replied", "ready", "opted_out", "mailboxes_paused"]);
    expect(data.summary.find((s) => s.metric === "warm")!.value).toBe(data.funnel.find((f) => f.step === "Warm seller")!.count);
    expect(data.leads.length).toBe(stores.leads.rows().length);
    expect(data.prospects.length).toBe(stores.prospects.rows().length);

    const text = JSON.stringify(data);
    for (const p of stores.prospects.rows()) {
      if (p.email) expect(text).not.toContain(p.email);
      if (p.owner_name) expect(text).not.toContain(p.owner_name);
    }
    expect(text).not.toMatch(/\b(senior|mid-career|surname|next gen|succession|age_est)\b/i);

    const files = writeDashboardData(stores, data);
    expect(files.map((f) => path.basename(f))).toEqual(["summary.json", "funnel.json", "activity.json", "prospects.json", "leads.json", "mailboxes.json"]);
  });
});
