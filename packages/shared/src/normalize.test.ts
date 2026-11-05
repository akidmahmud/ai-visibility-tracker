import { describe, expect, it } from "vitest";
import { normalizeDomain, normalizeName } from "./normalize";

describe("normalizeName", () => {
  it("merges legal-suffix and punctuation variants", () => {
    expect(normalizeName("Power Rogers, LLP")).toBe("power rogers");
    expect(normalizeName("Power Rogers LLP")).toBe("power rogers");
  });
  it("& → and, accents stripped", () => {
    expect(normalizeName("Smith & Sons")).toBe("smith and sons");
    expect(normalizeName("Café Müller GmbH")).toBe("cafe muller");
  });
  it("strips P.C. and stacked suffixes", () => {
    expect(normalizeName("Clifford Law, P.C.")).toBe("clifford law");
    expect(normalizeName("Acme Group Inc.")).toBe("acme");
  });
  it("only strips suffixes at the end", () => expect(normalizeName("Co-op Corp Bank")).toBe("co op corp bank"));
  it("does not merge distinct names", () => expect(normalizeName("Apple Hospitality")).not.toBe(normalizeName("Apple")));
});

describe("normalizeDomain", () => {
  it("strips scheme, www, path, case", () => expect(normalizeDomain("https://WWW.Example.com/a?b")).toBe("example.com"));
  it("accepts bare hosts", () => expect(normalizeDomain("www.foo.co.uk")).toBe("foo.co.uk"));
  it("null on junk", () => {
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("http://")).toBeNull();
  });
});
