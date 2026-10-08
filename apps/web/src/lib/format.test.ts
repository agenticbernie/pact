import { describe, expect, it } from "vitest";
import { formatBaseUnits, groupThousands, normalizeTimestamp, shortenMiddle } from "./format";

describe("formatBaseUnits", () => {
  it("renders 18-decimal base units exactly", () => {
    expect(formatBaseUnits("5000000000000000", 18)).toBe("0.005");
    expect(formatBaseUnits("100000000000000000", 18)).toBe("0.1");
    expect(formatBaseUnits("0", 18)).toBe("0");
  });

  it("keeps precision beyond Number.MAX_SAFE_INTEGER", () => {
    expect(formatBaseUnits("123456789012345678901", 18)).toBe("123.456789012345678901");
  });

  it("handles negative values and unknown input", () => {
    expect(formatBaseUnits("-2500000000000000000", 18)).toBe("-2.5");
    expect(formatBaseUnits("not-a-number", 18)).toBe("not-a-number");
  });
});

describe("groupThousands", () => {
  it("groups only the integer part", () => {
    expect(groupThousands("1234567.891")).toBe("1,234,567.891");
    expect(groupThousands("42")).toBe("42");
  });
});

describe("shortenMiddle", () => {
  it("keeps short values intact and shortens long ones", () => {
    expect(shortenMiddle("0x1234", 6, 4)).toBe("0x1234");
    expect(shortenMiddle("0x947a925d5677d6267d8bdba089fe715585e40b6324b4549928c8c8b2bffdc72f")).toBe(
      "0x947a…c72f",
    );
  });
});

describe("normalizeTimestamp", () => {
  it("normalizes both ISO and Date#toString input", () => {
    expect(normalizeTimestamp("2026-10-08T16:58:21.000Z")).toBe("2026-10-08T16:58:21.000Z");
    expect(normalizeTimestamp("Thu Oct 08 2026 16:58:21 GMT+0000 (Coordinated Universal Time)")).toBe(
      "2026-10-08T16:58:21.000Z",
    );
  });

  it("returns undefined for absent values and keeps unparsable text", () => {
    expect(normalizeTimestamp(undefined)).toBeUndefined();
    expect(normalizeTimestamp("")).toBeUndefined();
    expect(normalizeTimestamp("not a date")).toBe("not a date");
  });
});
