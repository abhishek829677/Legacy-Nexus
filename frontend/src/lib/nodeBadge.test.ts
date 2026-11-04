import { describe, expect, it } from "vitest";
import { BADGE_MEANING, badgeFor } from "./nodeBadge";

describe("badgeFor", () => {
  it("prefers the file's language, so the box says what kind of file it is", () => {
    expect(badgeFor("program", "cobol")).toBe("COBOL");
    expect(badgeFor("program", "java")).toBe("JAVA");
    expect(badgeFor("program", "javascript")).toBe("JS");
    expect(badgeFor("job", "jcl")).toBe("JCL");
    expect(badgeFor("procedure", "sql")).toBe("SQL");
  });

  it("falls back to the element type when there is no known language", () => {
    expect(badgeFor("table")).toBe("TABLE");
    expect(badgeFor("table", "")).toBe("TABLE");
    expect(badgeFor("dataset", null)).toBe("DATA FILE");
    expect(badgeFor("unresolved")).toBe("RUNTIME");
    expect(badgeFor("program", "klingon")).toBe("PROGRAM");
    expect(badgeFor("mystery")).toBe("MYSTERY");
  });

  it("has a plain-words meaning for every badge it can produce", () => {
    const langs = ["cobol", "jcl", "java", "javascript", "typescript", "python", "csharp", "sql", "shell", "api", "copybook", "doc", "yaml", "config"];
    const types = ["job", "program", "table", "column", "dataset", "api", "external", "unresolved", "procedure", "copybook", "config", "field"];
    for (const l of langs) expect(BADGE_MEANING[badgeFor("program", l)]).toBeTruthy();
    for (const t of types) expect(BADGE_MEANING[badgeFor(t)]).toBeTruthy();
  });
});
