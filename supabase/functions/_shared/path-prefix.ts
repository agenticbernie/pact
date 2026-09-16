/**
 * G23 shared Supabase prefix normalizer (sole authority; no second copy in
 * any function directory).
 *
 * The Supabase gateway preserves the `/functions/v1/<slug>` prefix, so each
 * `Deno.serve` handler normalizes `new URL(request.url).pathname` through
 * `normalizeFunctionPath(pathname, "<own-slug>")` as its first step. Pure and
 * deterministic: no I/O, no secrets, no network. Method dispatch downstream
 * is unchanged (the normalizer preserves method + remainder; it never maps
 * methods).
 */

export const FUNCTION_SLUGS = ["session", "ai-gateway", "agent-executor"] as const;

export type FunctionSlug = (typeof FUNCTION_SLUGS)[number];

export function normalizeFunctionPath(
  rawPathname: string,
  ownSlug: FunctionSlug,
): { ok: true; path: string } | { ok: false; code: "INPUT_INVALID" } {
  if (rawPathname.length === 0) return { ok: false, code: "INPUT_INVALID" };
  if (rawPathname !== rawPathname.trim()) return { ok: false, code: "INPUT_INVALID" };
  if (rawPathname.includes("%")) return { ok: false, code: "INPUT_INVALID" };
  if (rawPathname.includes("\\")) return { ok: false, code: "INPUT_INVALID" };
  if (rawPathname.includes("//")) return { ok: false, code: "INPUT_INVALID" };
  const segments = rawPathname.split("/");
  if (segments.includes(".") || segments.includes("..")) return { ok: false, code: "INPUT_INVALID" };
  if (!rawPathname.startsWith("/")) return { ok: false, code: "INPUT_INVALID" };
  const prefix = "/functions/v1/" + ownSlug;
  if (rawPathname === prefix) return { ok: false, code: "INPUT_INVALID" };
  if (rawPathname.startsWith(prefix + "/")) {
    const remainder = rawPathname.slice(prefix.length);
    if (remainder.startsWith("/functions/v1/")) return { ok: false, code: "INPUT_INVALID" };
    return { ok: true, path: remainder };
  }
  if (rawPathname.startsWith("/functions/v1/")) return { ok: false, code: "INPUT_INVALID" };
  // True-fix §16: proven hosted slug-preserved form `/<ownSlug>/<rest>`.
  // Own-literal single-segment strip only; no arbitrary-segment stripping.
  const singlePrefix = "/" + ownSlug;
  if (rawPathname === singlePrefix) return { ok: false, code: "INPUT_INVALID" };
  if (rawPathname.startsWith(singlePrefix + "/")) {
    const remainder = rawPathname.slice(singlePrefix.length);
    if (remainder === "/") return { ok: false, code: "INPUT_INVALID" };
    if (remainder === "/" + ownSlug || remainder.startsWith("/" + ownSlug + "/")) {
      return { ok: false, code: "INPUT_INVALID" };
    }
    if (remainder === "/functions/v1" || remainder.startsWith("/functions/v1/")) {
      return { ok: false, code: "INPUT_INVALID" };
    }
    return { ok: true, path: remainder };
  }
  for (const slug of FUNCTION_SLUGS) {
    if (slug === ownSlug) continue;
    if (rawPathname === "/" + slug || rawPathname.startsWith("/" + slug + "/")) {
      return { ok: false, code: "INPUT_INVALID" };
    }
  }
  return { ok: true, path: rawPathname };
}
