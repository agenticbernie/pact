export type DomainErrorCode =
  | "INTENT_SCHEMA_INVALID"
  | "SECRET_FIELD_REJECTED"
  | "MERCHANT_NOT_ALLOWLISTED"
  | "NETWORK_CONFIG_INVALID"
  | "AI_CONFIG_INVALID";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details: Record<string, string>;

  constructor(code: DomainErrorCode, message: string, details: Record<string, string> = {}) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}
