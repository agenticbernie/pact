import { describe, expect, it } from "vitest";
import { describeReasonCode } from "./reason-codes";

describe("reason codes", () => {
  it("explains a policy refusal in terms the operator can act on", () => {
    expect(describeReasonCode("POLICY_STALE")).toContain("Create a new intent");
    expect(describeReasonCode("CREDIT_EXCEEDED")).toContain("credit");
    expect(describeReasonCode("EXPIRED")).toContain("expired");
  });

  it("states that a reconciliation retry cannot settle twice", () => {
    expect(describeReasonCode("PAYMENT_RECONCILIATION_REQUIRED")).toContain("never settle twice");
  });

  it("returns nothing for an unknown or absent code, so it is shown verbatim", () => {
    expect(describeReasonCode("SOME_NEW_CHAIN_REASON")).toBeUndefined();
    expect(describeReasonCode(undefined)).toBeUndefined();
    expect(describeReasonCode("")).toBeUndefined();
  });
});
