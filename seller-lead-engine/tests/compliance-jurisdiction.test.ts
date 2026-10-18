import { describe, expect, it } from "vitest";
import { fccWirelessDomains, isFccWirelessDomain, jurisdictionBlock, phoneBlock, tldOf } from "../src/compliance/jurisdiction.ts";
import { testConfig } from "./helpers.ts";

const config = testConfig();
const fl = { state: "FL", zip: "33602" };

describe("jurisdictionBlock", () => {
  it("allows a Florida business at a .com address when Florida is licensed", () => {
    expect(jurisdictionBlock(fl, "john@exampleair.com", config)).toBeUndefined();
    expect(jurisdictionBlock({ state: "fl", zip: "33602-1234", phone: "813.364.2178" }, "john@exampleair.us", config)).toBeUndefined();
  });

  it("blocks everything when licensed_states is empty", () => {
    expect(jurisdictionBlock(fl, "john@exampleair.com", testConfig({ licensed_states: [] }))).toMatch(/licensed_states is empty/);
  });

  it("blocks a state outside licensed_states, citing licensing", () => {
    expect(jurisdictionBlock({ state: "CA", zip: "90001" }, "john@exampleair.com", config)).toMatch(/CA is not in licensed_states \(FL\)/);
  });

  it("blocks unknown and non-US states", () => {
    expect(jurisdictionBlock({ state: "", zip: "33602" }, "john@exampleair.com", config)).toMatch(/unknown/);
    expect(jurisdictionBlock({ state: "ON", zip: "M5V 2T6" }, "john@exampleair.com", config)).toMatch(/not a US state/);
    expect(jurisdictionBlock({ state: "PR", zip: "00901" }, "john@exampleair.com", config)).toMatch(/not a US state/);
  });

  it("blocks a missing or non-US ZIP", () => {
    expect(jurisdictionBlock({ state: "FL", zip: "" }, "john@exampleair.com", config)).toMatch(/ZIP code is missing/);
    expect(jurisdictionBlock({ state: "FL", zip: "M5V 2T6" }, "john@exampleair.com", config)).toMatch(/not a US ZIP/);
  });

  it("blocks non-US country-code TLDs but allows .us", () => {
    for (const email of ["a@x.ca", "a@x.co.uk", "a@x.eu", "a@x.de", "a@x.fr", "a@x.mx", "a@x.com.au", "a@x.ie"]) {
      expect(jurisdictionBlock(fl, email, config), email).toMatch(/non-US country code/);
    }
    expect(jurisdictionBlock(fl, "a@x.quebec", config)).toMatch(/non-US geographic/);
    expect(jurisdictionBlock(fl, "a@x.us", config)).toBeUndefined();
  });

  it("blocks FCC wireless domains and their subdomains", () => {
    expect(jurisdictionBlock(fl, "8135551234@vtext.com", config)).toMatch(/FCC wireless/);
    expect(jurisdictionBlock(fl, "8135551234@TMOMAIL.NET", config)).toMatch(/64\.3100/);
    expect(isFccWirelessDomain("x.txt.att.net")).toBe(true);
    expect(isFccWirelessDomain("att.net")).toBe(false);
  });

  it("blocks Canadian and Caribbean phone numbers, and non-NANP international numbers", () => {
    expect(jurisdictionBlock({ ...fl, phone: "(416) 555-0100" }, "a@x.com", config)).toMatch(/416 is Canadian or Caribbean/);
    expect(jurisdictionBlock({ ...fl, phone: "+1 876 555 0100" }, "a@x.com", config)).toMatch(/876/);
    expect(phoneBlock("+44 20 7946 0000")).toMatch(/outside the NANP/);
    expect(phoneBlock("011 52 55 5555 5555")).toMatch(/international/);
    expect(phoneBlock("813.364.2178")).toBeUndefined();
    expect(phoneBlock("")).toBeUndefined();
  });

  it("blocks an address with no domain", () => {
    expect(jurisdictionBlock(fl, "john", config)).toMatch(/no valid domain/);
    expect(jurisdictionBlock(fl, "", config)).toMatch(/no valid domain/);
  });
});

describe("reference lists", () => {
  it("ships the FCC list with the main carrier gateways and reads the TLD of an address", () => {
    const list = fccWirelessDomains();
    for (const d of ["vtext.com", "txt.att.net", "tmomail.net", "messaging.sprintpcs.com"]) expect(list.has(d), d).toBe(true);
    expect([...list].every((d) => d === d.toLowerCase() && !d.startsWith("#"))).toBe(true);
    expect(tldOf("John@Example.CO.UK")).toBe("uk");
  });
});
