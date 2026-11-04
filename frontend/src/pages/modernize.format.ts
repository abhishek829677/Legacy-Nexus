/**
 * Pure number formatters for the Modernize page. They never invent a value:
 * anything missing or not a finite number comes back as null, and the caller shows the
 * "not available" text from modernize.copy.ts.
 */

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const intFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Whole numbers with thousands separators: 1177 -> "1,177". */
export function fmtInt(n: unknown): string | null {
  return isNum(n) ? intFmt.format(Math.round(n)) : null;
}

/** Averages with one decimal: 52.038 -> "52.0". */
export function fmtAvg(n: unknown): string | null {
  return isNum(n) ? n.toFixed(1) : null;
}

/** Readiness scores are 0-100 (proven in backend/app/engine/modernization.py _readiness): 72 -> "72 / 100". */
export function fmtScore(n: unknown): string | null {
  return isNum(n) ? `${Math.round(n)} / 100` : null;
}

/** Factor weights are a 0-1 fraction (backend: weight = 1 / len(factors)): 0.2 -> "20%". */
export function fmtWeight(w: unknown): string | null {
  return isNum(w) && w >= 0 && w <= 1 ? `${Math.round(w * 100)}%` : null;
}

/** Picks the singular or plural word for a count. */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** "part of total" without dividing. Null when either side is missing or the total is 0. */
export function fmtOf(part: unknown, total: unknown): { part: string; total: string; totalN: number } | null {
  if (!isNum(part) || !isNum(total) || total === 0) return null;
  return { part: fmtInt(part)!, total: fmtInt(total)!, totalN: total };
}

/** True when the current selections differ from the ones the shown plan was generated with. */
export function selectionsChanged<T extends Record<string, string>>(generatedWith: T | null, current: T): boolean {
  if (!generatedWith) return false;
  return Object.keys(current).some((k) => current[k] !== generatedWith[k]);
}

/** Status band used by the page's existing colours and the backend's level cut-offs (75 and 50). */
export type Band = "good" | "prep" | "attention";
export function scoreBand(score: unknown): Band | null {
  if (!isNum(score)) return null;
  return score >= 75 ? "good" : score >= 50 ? "prep" : "attention";
}
