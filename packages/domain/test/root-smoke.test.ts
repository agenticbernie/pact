import { describe, expect, it } from "vitest";
import { FOUNDATION_MARKER } from "@pact/domain/bootstrap";

describe("pact foundation smoke", () => {
  it("exposes the foundation marker", () => {
    expect(FOUNDATION_MARKER).toBe(true);
  });
});
