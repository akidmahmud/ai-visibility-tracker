import { describe, expect, it } from "vitest";
import { body } from "./cloro";
import { googleLocation, parseLocation, usState } from "./location";

describe("location", () => {
  it("parses US city + state in the common forms", () => {
    expect(parseLocation("Phoenix, AZ", "US")).toEqual({ city: "Phoenix", state: "AZ" });
    expect(parseLocation("Phoenix, Arizona, US", "US")).toEqual({ city: "Phoenix", state: "AZ" });
    expect(parseLocation("Arizona", "US")).toEqual({ city: null, state: "AZ" });
    expect(parseLocation("Scottsdale", "US")).toEqual({ city: "Scottsdale", state: null });
  });
  it("Google canonical names", () => {
    expect(googleLocation("Phoenix, AZ", "US")).toBe("Phoenix,Arizona,United States");
    expect(googleLocation("Arizona", "US")).toBe("Arizona,United States");
    expect(googleLocation("Manchester", "GB")).toBe("Manchester,United Kingdom");
  });
  it("state codes only for the US", () => {
    expect(usState("Chicago, IL", "US")).toBe("IL");
    expect(usState("Toronto, ON", "CA")).toBeNull();
    expect(usState(undefined, "US")).toBeNull();
  });
});


describe("Cloro request geo", () => {
  const base = { prompt: "best aeo agency", country: "US", language: "en", wantFanout: false };
  it("Google engines get the canonical location, assistants the state code", () => {
    expect(body({ ...base, model: "google_ai_mode", location: "Phoenix, AZ" })).toMatchObject({ location: "Phoenix,Arizona,United States" });
    expect(body({ ...base, model: "gemini", location: "Phoenix, AZ" })).toMatchObject({ state: "AZ", country: "US" });
    expect(body({ ...base, model: "gemini" })).not.toHaveProperty("state");
  });
});
