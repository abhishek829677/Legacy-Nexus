/** Short type badges drawn inside graph boxes, so every box says what kind of thing it is. */

/** Language of a source file or program (from the parser's `language` field). */
const LANGUAGE_BADGE: Record<string, string> = {
  cobol: "COBOL", jcl: "JCL", java: "JAVA", javascript: "JS", typescript: "TS", python: "PYTHON", csharp: "C#",
  sql: "SQL", shell: "SHELL", api: "API", copybook: "COPYBOOK", doc: "DOC", yaml: "YAML", config: "CONFIG",
};

/** Element type (from the knowledge graph's `type` field). */
const TYPE_BADGE: Record<string, string> = {
  job: "JOB", program: "PROGRAM", table: "TABLE", column: "COLUMN", dataset: "DATA FILE", api: "API",
  external: "EXTERNAL", unresolved: "RUNTIME", procedure: "PROCEDURE", copybook: "COPYBOOK", config: "CONFIG",
  field: "FIELD",
};

/** Plain-words name for each badge, used in legends and screen-reader text. */
export const BADGE_MEANING: Record<string, string> = {
  COBOL: "COBOL program", JCL: "JCL batch job", JAVA: "Java source file", JS: "JavaScript file", TS: "TypeScript file",
  PYTHON: "Python file", "C#": "C# file", SQL: "SQL script", SHELL: "Shell script", API: "API definition",
  COPYBOOK: "Shared record layout (copybook)", DOC: "Document", YAML: "YAML configuration", CONFIG: "Configuration",
  JOB: "Batch job", PROGRAM: "Program", TABLE: "Database table", COLUMN: "Table column", "DATA FILE": "Data file or report",
  EXTERNAL: "Outside system", RUNTIME: "Call decided at run time", PROCEDURE: "Stored procedure", FIELD: "Data field in a program",
};

/** The badge for a node: its language when known (what kind of file it is), otherwise its element type. */
export function badgeFor(type: string, language?: unknown): string {
  if (typeof language === "string" && language) {
    const l = LANGUAGE_BADGE[language.toLowerCase()];
    if (l) return l;
  }
  return TYPE_BADGE[type] ?? type.toUpperCase();
}
