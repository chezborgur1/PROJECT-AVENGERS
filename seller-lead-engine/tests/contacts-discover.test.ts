import { describe, expect, it } from "vitest";
import { discoverEmails, extractEmails, hasNoHarvestNotice, parseRobots, robotsAllows, siteUrl } from "../src/contacts/discover.ts";

/** A fake website: path -> { status, body, type, url }; unknown paths are 404. Records every URL fetched. */
function site(pages: Record<string, { status?: number; body?: string; type?: string; url?: string } | "throw">) {
  const fetched: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    fetched.push(url);
    const p = new URL(url).pathname;
    const page = pages[p];
    if (page === "throw") throw new Error("socket hang up");
    if (!page) return new Response("not found", { status: 404 });
    const res = new Response(page.body ?? "", { status: page.status ?? 200, headers: { "Content-Type": page.type ?? "text/html; charset=utf-8" } });
    if (page.url) Object.defineProperty(res, "url", { value: page.url });
    return res;
  }) as typeof fetch;
  return { impl, fetched };
}

const home = `<html><body><h1>Example Air</h1><p>Call or email <a href="mailto:john@exampleair.com?subject=Hi">John</a>.</p>
  <footer>Site by <a href="mailto:dev@webdesigner.example">dev@webdesigner.example</a>. Logo logo@2x.png</footer></body></html>`;

describe("robots.txt", () => {
  it("applies the * group, longest match wins and Allow wins a tie", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /contact\nAllow: /contact-us\n\nUser-agent: Googlebot\nDisallow: /\n");
    expect(robotsAllows(rules, "/")).toBe(true);
    expect(robotsAllows(rules, "/contact")).toBe(false);
    expect(robotsAllows(rules, "/contact-us")).toBe(true);
    expect(robotsAllows(rules, "/about")).toBe(true);
  });

  it("prefers a group naming this crawler over the * group", () => {
    const rules = parseRobots("User-agent: *\nDisallow:\n\nUser-agent: AMBAdvisoryLeadEngine\nDisallow: /\n");
    expect(robotsAllows(rules, "/")).toBe(false);
  });

  it("supports * wildcards and $ anchors", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /*bout$\n");
    expect(robotsAllows(rules, "/about")).toBe(false);
    expect(robotsAllows(rules, "/about/team")).toBe(true);
  });

  it("treats an empty Disallow as allow-all", () => {
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow:\n"), "/contact")).toBe(true);
  });
});

describe("page parsing", () => {
  it("extracts mailto and plain addresses at the site's domain only", () => {
    const html = `${home}<p>Office: office&#64;exampleair.com, billing@mail.exampleair.com.</p><p>frank [at] exampleair.com</p>`;
    expect(extractEmails(html, "exampleair.com")).toEqual(["john@exampleair.com", "office@exampleair.com", "billing@mail.exampleair.com"]);
  });

  it("finds no-harvest notices in text and meta tags", () => {
    expect(hasNoHarvestNotice("<p>Please do not harvest email addresses from this site.</p>")).toBe(true);
    expect(hasNoHarvestNotice("<p>No unsolicited email, please.</p>")).toBe(true);
    expect(hasNoHarvestNotice('<meta name="description" content="Addresses on this site may not be used for marketing">')).toBe(true);
    expect(hasNoHarvestNotice("<p>We service AC units across Tampa.</p>")).toBe(false);
  });

  it("normalises website values to URLs", () => {
    expect(siteUrl("exampleair.com")?.origin).toBe("https://exampleair.com");
    expect(siteUrl("http://www.exampleair.com/home")?.origin).toBe("http://www.exampleair.com");
    expect(siteUrl("")).toBeUndefined();
    expect(siteUrl("not a site")).toBeUndefined();
  });
});

describe("discoverEmails", () => {
  it("fetches home, contact, contact-us and about on the same host and returns each address once with its page", async () => {
    const s = site({
      "/robots.txt": { body: "User-agent: *\nDisallow:\n", type: "text/plain" },
      "/": { body: home },
      "/contact": { body: '<a href="mailto:JOHN@exampleair.com">x</a> <a href="mailto:office@exampleair.com">y</a>' },
      "/about": { body: "<p>Mary Example, mary@exampleair.com</p>" },
    });
    const found = await discoverEmails("www.exampleair.com", { fetchImpl: s.impl });
    expect(found).toEqual([
      { email: "john@exampleair.com", url: "https://www.exampleair.com/" },
      { email: "office@exampleair.com", url: "https://www.exampleair.com/contact" },
      { email: "mary@exampleair.com", url: "https://www.exampleair.com/about" },
    ]);
    expect(s.fetched.every((u) => u.startsWith("https://www.exampleair.com/"))).toBe(true);
    expect(s.fetched.map((u) => new URL(u).pathname)).toEqual(["/robots.txt", "/", "/contact", "/contact-us", "/about"]);
  });

  it("skips pages robots.txt disallows", async () => {
    const s = site({
      "/robots.txt": { body: "User-agent: *\nDisallow: /contact\n", type: "text/plain" },
      "/": { body: "<p>no email here</p>" },
      "/contact": { body: '<a href="mailto:john@exampleair.com">x</a>' },
      "/contact-us": { body: '<a href="mailto:john@exampleair.com">x</a>' },
    });
    expect(await discoverEmails("exampleair.com", { fetchImpl: s.impl })).toEqual([]);
    expect(s.fetched.some((u) => u.includes("/contact"))).toBe(false);
  });

  it("returns nothing for a site whose robots.txt is unreachable", async () => {
    expect(await discoverEmails("exampleair.com", { fetchImpl: site({ "/robots.txt": { status: 503 }, "/": { body: home } }).impl })).toEqual([]);
    expect(await discoverEmails("exampleair.com", { fetchImpl: site({ "/robots.txt": "throw", "/": { body: home } }).impl })).toEqual([]);
  });

  it("treats a missing robots.txt as no rules", async () => {
    const found = await discoverEmails("exampleair.com", { fetchImpl: site({ "/": { body: home } }).impl });
    expect(found.map((f) => f.email)).toEqual(["john@exampleair.com"]);
  });

  it("returns nothing at all when any page carries a no-harvest notice", async () => {
    const s = site({
      "/": { body: home },
      "/contact": { body: '<a href="mailto:office@exampleair.com">x</a><small>No unsolicited commercial email.</small>' },
    });
    expect(await discoverEmails("exampleair.com", { fetchImpl: s.impl })).toEqual([]);
  });

  it("ignores redirects to another host, non-HTML responses and failing pages", async () => {
    const s = site({
      "/": { body: home, url: "https://parked-domains.example/" },
      "/contact": { body: "john@exampleair.com", type: "application/pdf" },
      "/contact-us": "throw",
      "/about": { body: "<p>mary@exampleair.com</p>" },
    });
    expect((await discoverEmails("exampleair.com", { fetchImpl: s.impl })).map((f) => f.email)).toEqual(["mary@exampleair.com"]);
  });

  it("stops at maxPages and returns nothing for a blank website", async () => {
    const s = site({ "/": { body: "<p>none</p>" }, "/contact": { body: "<p>john@exampleair.com</p>" } });
    expect(await discoverEmails("exampleair.com", { fetchImpl: s.impl, maxPages: 1 })).toEqual([]);
    expect(await discoverEmails("", { fetchImpl: s.impl })).toEqual([]);
  });
});
