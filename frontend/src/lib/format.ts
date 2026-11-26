export const TYPE_COLORS: Record<string, string> = {
  job: "#6352c6",
  program: "#2c67a8",
  table: "#15807a",
  column: "#4f9e97",
  dataset: "#a8701a",
  api: "#ad3f78",
  external: "#6f7c8e",
  procedure: "#3b8a43",
  copybook: "#8a6a4a",
  field: "#5f6f86",
  unresolved: "#c2410c",
  config: "#64748b",
};

export const TYPE_LABELS: Record<string, string> = {
  job: "Batch job",
  program: "Program",
  table: "DB table",
  column: "Column",
  dataset: "Dataset / report",
  api: "API",
  external: "External interface",
  procedure: "Stored procedure",
  copybook: "Copybook",
  unresolved: "Runtime call (unresolved)",
  config: "Configuration",
  field: "Data field",
  paragraph: "Paragraph",
  condition: "Condition name",
  file: "Source file",
};

export function fmtNumber(n: number | undefined | null) {
  return n === undefined || n === null ? "—" : new Intl.NumberFormat().format(n);
}

/**
 * Parses an API timestamp. The server stores UTC, but SQLite drops the offset, so values can arrive as
 * "2026-11-13T06:37:25" with no zone; the browser would read those as local time. Treat them as UTC.
 */
export function parseApiDate(iso: string): Date {
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(iso.trim());
  return new Date(hasZone ? iso : `${iso.trim()}Z`);
}

/** A timestamp in the viewer's own time zone, with the zone shown (e.g. "13 Nov 2026, 12:07 pm IST"). */
export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = parseApiDate(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dateTime = d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const zone = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value;
  return zone ? `${dateTime} ${zone}` : dateTime;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function severityTag(sev: string) {
  return sev === "High" ? "tag-red" : sev === "Medium" ? "tag-amber" : "tag-green";
}

export function criticalityTag(level: string) {
  return (
    { Critical: "tag-red", High: "tag-amber", Medium: "tag-blue", Low: "tag-green", Unused: "" } as Record<string, string>
  )[level] ?? "";
}
