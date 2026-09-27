import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CsvRequestStore, buildQueue } from "../src/requests/csvStore.ts";
import { REPO, tmpDir } from "./helpers.ts";

function tempStore(): { store: CsvRequestStore; file: string } {
  const file = path.join(tmpDir(), "requests.csv");
  fs.copyFileSync(path.join(REPO, "requests/high-priority-requests.csv"), file);
  return { store: new CsvRequestStore(file), file };
}

describe("request list", () => {
  it("validates rows and parses optional numbers", () => {
    const { rows, invalid } = tempStore().store.load();
    expect(invalid).toEqual([]);
    expect(rows[0]).toMatchObject({ request_id: "REQ-0001", owner_replacement_salary: 95_000, year_founded: 2009, asking_price: undefined });
  });

  it("queues P1 new/rerun requests by priority, then due date", () => {
    const { rows } = tempStore().store.load();
    const base = rows[0]!;
    const mk = (id: string, priority: "P1" | "P2", status: typeof base.status, due: string) => ({ ...base, request_id: id, priority, status, due_date: due });
    const queue = buildQueue([
      mk("A", "P2", "new", "2026-10-01"),
      mk("B", "P1", "new", "2026-10-09"),
      mk("C", "P1", "rerun", "2026-10-03"),
      mk("D", "P1", "done", "2026-10-01"),
      mk("E", "P1", "needs_info", "2026-10-01"),
    ]);
    expect(queue.map((r) => r.request_id)).toEqual(["C", "B"]);
    expect(buildQueue([mk("A", "P2", "new", "2026-10-01")], { maxPriority: "P2" }).length).toBe(1);
    expect(buildQueue([mk("D", "P1", "done", "2026-10-01")], { ids: ["D"] }).length).toBe(1);
  });

  it("reports a bad row without blocking the rest", () => {
    const { store, file } = tempStore();
    fs.appendFileSync(file, "REQ-0099,P9,new,,,,Bad Co,Project Bad,,,S-Corp,,,12-31,,,,,,,,\n");
    const { rows, invalid } = store.load();
    expect(rows.length).toBe(2);
    expect(invalid[0]).toMatchObject({ requestId: "REQ-0099" });
  });

  it("updates status in place and keeps other rows intact", () => {
    const { store, file } = tempStore();
    const before = fs.readFileSync(file, "utf8").split("\n")[2];
    store.update("REQ-0001", { status: "done", output_folder: "output/REQ-0001 Project Ridgeline" });
    const { rows } = store.load();
    expect(rows[0]).toMatchObject({ status: "done", output_folder: "output/REQ-0001 Project Ridgeline" });
    expect(fs.readFileSync(file, "utf8").split("\n")[2]).toBe(before);
  });
});
