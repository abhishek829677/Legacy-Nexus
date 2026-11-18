import { describe, expect, it } from "vitest";
import { fmtDate, parseApiDate } from "./format";

describe("parseApiDate", () => {
  it("reads a timestamp without a zone (SQLite) as UTC", () => {
    expect(parseApiDate("2026-11-13T06:37:25.327630").toISOString()).toBe("2026-11-13T06:37:25.327Z");
  });

  it("keeps an explicit zone (PostgreSQL)", () => {
    expect(parseApiDate("2026-11-13T06:37:25+00:00").toISOString()).toBe("2026-11-13T06:37:25.000Z");
    expect(parseApiDate("2026-11-13T12:07:25+05:30").toISOString()).toBe("2026-11-13T06:37:25.000Z");
    expect(parseApiDate("2026-11-13T06:37:25Z").toISOString()).toBe("2026-11-13T06:37:25.000Z");
  });
});

describe("fmtDate", () => {
  it("shows a dash for missing or unreadable values", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("not a date")).toBe("—");
  });

  it("formats in the viewer's zone and names the zone", () => {
    const out = fmtDate("2026-11-13T06:37:25");
    const local = new Date(Date.UTC(2026, 10, 13, 6, 37, 25)).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    expect(out.startsWith(local)).toBe(true);
    expect(out.length).toBeGreaterThan(local.length); // zone label appended
  });
});
