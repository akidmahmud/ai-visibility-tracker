import { describe, expect, it } from "vitest";
import { decrypt, encrypt, makeState, readState } from "../src/integrations/crypto";

describe("secrets at rest", () => {
  it("round-trips, and each encryption is different", () => {
    const a = encrypt("1//refresh-token");
    expect(a).not.toBe(encrypt("1//refresh-token"));
    expect(decrypt(a)).toBe("1//refresh-token");
  });
  it("tampering is detected", () => {
    const [iv, tag, data] = encrypt("secret").split(".");
    const flipped = (data![0] === "A" ? "B" : "A") + data!.slice(1);
    expect(() => decrypt([iv, tag, flipped].join("."))).toThrow();
  });
});

describe("OAuth state", () => {
  it("binds to a workspace and expires after 15 minutes", () => {
    const now = Date.now();
    const state = makeState("ws-1", now);
    expect(readState(state, now + 60_000)).toBe("ws-1");
    expect(readState(state, now + 16 * 60_000)).toBeNull();
  });
  it("rejects a forged state", () => {
    const [payload] = makeState("ws-1").split(".");
    const forged = Buffer.from(JSON.stringify({ w: "ws-2", t: Date.now() })).toString("base64url");
    expect(readState(`${forged}.${makeState("ws-1").split(".")[1]}`)).toBeNull();
    expect(readState(`${payload}.not-a-mac`)).toBeNull();
  });
});
