import { defineTheme } from "@astryxdesign/core/theme";

/**
 * Pact console theme — "Modern Structural Precision".
 *
 * The console is an operator-grade settlement surface: high information
 * density, hairline structure instead of drop shadows, and high-chroma colour
 * reserved for state. This theme is the single place those decisions live; no
 * component writes a raw hex or px value.
 *
 * Structural choices, in the design system's own vocabulary:
 * - Substrates: a cool slate canvas (`#F8FAFC`) framing pure white panels.
 * - Depth: layering and 1px perimeter bounds only — `--shadow-low` is off, so a
 *   resting panel never floats.
 * - Typography: Hanken Grotesk for prose, JetBrains Mono for hashes, addresses
 *   and base-unit amounts. Headings stay on the body family (grotesque, not
 *   serif) per the design's font pair.
 * - Shape: a 4dp radius base — engineered precision, never bulbous.
 * - State semantics: settled / indexing / failed are the accents that carry
 *   meaning, so they are pinned to the design's exact signal colours.
 *
 * The theme is consumed unbuilt — `<Theme theme={pactTheme}>` injects its
 * tokens in the browser, which is what a client-only Vite app wants.
 */
export const pactTheme = defineTheme({
  name: "pact",
  color: { accent: "#0064E0", neutralStyle: "cool", contrast: "standard" },
  typography: {
    scale: { base: 14, ratio: 1.2 },
    body: {
      family: "Hanken Grotesk",
      fallbacks: '-apple-system, system-ui, "Segoe UI", Roboto, sans-serif',
    },
    code: {
      family: "JetBrains Mono",
      fallbacks: '"SF Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    },
    heading: { weight: "semibold", weights: { 1: "bold", 2: "semibold" } },
  },
  radius: { base: 4, multiplier: 1 },
  motion: { fast: 120, medium: 240, slow: 600, ratio: 0.75 },
  tokens: {
    // ── Substrate layers ────────────────────────────────────────────────
    "--color-background-body": ["#F8FAFC", "#111214"],
    "--color-background-surface": ["#FFFFFF", "#1A1B1E"],
    "--color-background-card": ["#FFFFFF", "#1A1B1E"],
    // Interior inset panels (parsed payloads, raw telemetry).
    "--color-background-muted": ["#F1F5F9", "#232529"],

    // ── Architectonic hairlines, not shadows ────────────────────────────
    "--color-border": ["#E2E8F0", "#2A2D33"],
    "--color-border-emphasized": ["#CBD5E1", "#3B3F46"],
    "--shadow-low": "none",
    "--shadow-med":
      "0 4px 12px -2px rgba(15, 23, 42, 0.06), 0 2px 4px -1px rgba(15, 23, 42, 0.03)",

    // ── Typographic hierarchy ───────────────────────────────────────────
    "--color-text-primary": ["#1B1C1E", "#E7EAED"],
    "--color-text-secondary": ["#64748B", "#9BA3AE"],

    // ── Deterministic state semantics ───────────────────────────────────
    // Settled / verified.
    "--color-success": ["#059669", "#34D399"],
    "--color-success-muted": ["#ECFDF5", "#0C2A20"],
    // Indexing / pending.
    "--color-warning": ["#D97706", "#FBBF24"],
    "--color-warning-muted": ["#FFFBEB", "#2E2408"],
    // Execution failed.
    "--color-error": ["#E11D48", "#FB7185"],
    "--color-error-muted": ["#FFF1F2", "#2E1017"],

    "--focus-outline-color": "var(--color-accent)",
  },
  components: {
    // Panels are bounded by a hairline, never lifted.
    card: {
      base: {
        borderWidth: "var(--border-width)",
        borderStyle: "solid",
        borderColor: "var(--color-border)",
        boxShadow: "none",
      },
    },
    // Disciplined 4px geometry on interactive elements.
    button: {
      base: {
        borderRadius: "var(--radius-element)",
        fontWeight: "var(--font-weight-medium)",
      },
    },
    // Status chips read as machine output: monospace, bordered, tinted.
    token: {
      base: {
        borderRadius: "var(--radius-element)",
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: "var(--color-border)",
        fontFamily: "var(--font-family-code)",
      },
    },
    "app-shell": {
      base: { backgroundColor: "var(--color-background-body)" },
    },
    // High-density rows and micro-label column headers.
    "table-header-cell": {
      base: {
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        fontSize: "var(--font-size-xs)",
        fontWeight: "var(--font-weight-semibold)",
        color: "var(--color-text-secondary)",
      },
    },
  },
});
