import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalEmail, Suppression } from "../src/compliance/suppression.ts";
import { tempStores } from "./helpers.ts";

const NOW = new Date("2026-10-18T14:00:00Z");
const LATER = new Date("2026-11-02T09:30:00Z");

describe("Suppression", () => {
  it("matches an email in any case, with or without a +tag", () => {
    const s = new Suppression(tempStores().suppression);
    s.add("John+News@ExampleAir.com", "email", "opt_out", "reply R-1", NOW);
    expect(s.check("john+news@exampleair.com")?.reason).toBe("opt_out");
    expect(s.check(" JOHN@exampleair.com ")).toBeDefined();
    expect(s.check("john+other@exampleair.com")).toBeDefined();
    expect(s.check("mary@exampleair.com")).toBeUndefined();
  });

  it("treats Gmail dots and googlemail.com as the same mailbox", () => {
    expect(canonicalEmail("J.O.H.N+x@GoogleMail.com")).toBe("john@gmail.com");
    const s = new Suppression(tempStores().suppression);
    s.add("john.example@gmail.com", "email", "opt_out", "manual", NOW);
    expect(s.check("johnexample@gmail.com")).toBeDefined();
    // Dots matter at other providers.
    s.add("john.example@exampleair.com", "email", "opt_out", "manual", NOW);
    expect(s.check("johnexample@exampleair.com")).toBeUndefined();
  });

  it("matches a suppressed domain and its subdomains, and a prospect id", () => {
    const s = new Suppression(tempStores().suppression);
    s.add("@Client.example", "domain", "client", "manual", NOW);
    s.add("P-00042", "prospect", "wrong_person", "reply R-9", NOW);
    expect(s.check("anyone@client.example")?.value).toBe("client.example");
    expect(s.check("anyone@mail.client.example")?.value).toBe("client.example");
    expect(s.check("anyone@notclient.example")).toBeUndefined();
    expect(s.check("new@other.example", "P-00042")?.reason).toBe("wrong_person");
    expect(s.check("", "P-00042")).toBeDefined();
    expect(s.check("new@other.example", "P-00043")).toBeUndefined();
  });

  it("is idempotent: adding again keeps the first reason and date and writes no second row", () => {
    const stores = tempStores();
    const s = new Suppression(stores.suppression);
    s.add("john@exampleair.com", "email", "opt_out", "reply R-1", NOW);
    s.add("JOHN@exampleair.com", "email", "complaint", "reply R-2", LATER);
    expect(stores.suppression.rows()).toEqual([{ value: "john@exampleair.com", value_type: "email", reason: "opt_out", source: "reply R-1", added_at: "2026-10-18T14:00:00Z" }]);
    expect(s.all().length).toBe(1);
  });

  it("persists rows so a new instance sees them, and never offers a way to remove one", () => {
    const stores = tempStores();
    new Suppression(stores.suppression).add("john@exampleair.com", "email", "bounce", "bounce T-000001", NOW);
    const again = new Suppression(stores.suppression);
    expect(again.check("john@exampleair.com")?.source).toBe("bounce T-000001");
    expect(Object.getOwnPropertyNames(Suppression.prototype).filter((n) => /remove|delete|purge|clear/i.test(n))).toEqual([]);
  });

  it("sees rows another process added after reload", () => {
    const stores = tempStores();
    const s = new Suppression(stores.suppression);
    stores.suppression.append([{ value: "late@exampleair.com", value_type: "email", reason: "opt_out", source: "manual", added_at: "" }]);
    expect(s.check("late@exampleair.com")).toBeUndefined();
    s.reload();
    expect(s.check("late@exampleair.com")).toBeDefined();
  });

  it("refuses values that are not an email, a domain or a prospect id", () => {
    const s = new Suppression(tempStores().suppression);
    expect(() => s.add("not-an-email", "email", "opt_out", "manual", NOW)).toThrow(/not an email/);
    expect(() => s.add("no dots", "domain", "opt_out", "manual", NOW)).toThrow(/not a domain/);
    expect(() => s.add("  ", "prospect", "opt_out", "manual", NOW)).toThrow(/blank/);
  });

  it("fails closed when the file has an unreadable row, but still records new opt-outs", () => {
    const stores = tempStores();
    new Suppression(stores.suppression).add("john@exampleair.com", "email", "opt_out", "manual", NOW);
    fs.appendFileSync(stores.suppression.file, "mystery@exampleair.com,email,not_a_reason,manual,\n");
    const s = new Suppression(stores.suppression);
    expect(s.invalid.length).toBe(1);
    const hit = s.check("anyone@else.example");
    expect(hit?.source).toMatch(/unreadable row/);
    s.add("mary@exampleair.com", "email", "opt_out", "reply R-3", NOW);
    expect(stores.suppression.rows().map((r) => r.value)).toEqual(["john@exampleair.com", "mary@exampleair.com"]);
  });
});
