import type { Guide } from "../components/PageGuide";

/** Plain-language "How to read this page" text. Kept in step with the backend behaviour it describes. */
export const GUIDES: Record<"mapBusiness" | "mapTechnical" | "impact" | "lineage", Guide> = {
  mapBusiness: {
    title: "How to read the dependency map",
    steps: [
      "Each box is a file or a piece of data. The small badge inside says what it is: COBOL, JCL, JAVA, TABLE, DATA FILE and so on.",
      "Arrows show what uses what: a job runs a program, a program reads or writes a table, a file is passed on to the next step.",
      "Click any box to see what it does in plain words. Then press “Follow the flow” to walk through what happens next, step by step.",
    ],
    terms: [
      ["Critical", "many other parts depend on it"],
      ["Unused", "nothing calls, runs or exposes it"],
      ["RUNTIME", "a call whose target is only known when the program runs"],
    ],
  },
  mapTechnical: {
    title: "How to read the technical view",
    steps: [
      "Each box is one element: a program, batch job, table, data file, API or stored procedure. The badge shows its type or language.",
      "Solid arrows are calls, reads, writes and runs (green = writes). Dashed orange arrows are calls decided at run time.",
      "Search to focus on one element and its neighbours. Click a box to see its callers, the code evidence and its business rules.",
    ],
    terms: [
      ["Hops", "how many links away from the focused element to show"],
      ["Fan-in", "how many elements call or use it"],
    ],
  },
  impact: {
    title: "How impact analysis works",
    steps: [
      "Name what is about to change: a column, table, program, copybook or data file. Or pick a file on the left.",
      "LegacyNexus follows the data and the logic from there, step by step, to everything that could be affected.",
      "Each result is graded High, Medium or Low and shows the path and the file and line behind every step. Start with High.",
    ],
    terms: [
      ["High", "directly connected, or the value itself reaches it (tables, files and APIs within 4 steps)"],
      ["Medium", "a few steps away, or only a decision depends on it"],
      ["Low", "far away and affected only through a condition"],
    ],
  },
  lineage: {
    title: "How to read data lineage",
    steps: [
      "Pick a database column or a data field in a program (the search suggests names as you type).",
      "The map shows where its value comes from on the left and everywhere it goes on the right, one step at a time.",
      "Solid lines move or copy the value. Dashed orange lines mean the value is used in a decision (for example an IF) that sets another value.",
    ],
    terms: [
      ["Upstream", "where the value comes from"],
      ["Downstream", "where the value goes"],
      ["Hops", "how many steps to follow"],
    ],
  },
};

/** Field-level lineage is traced only for these languages (see backend/app/engine/knowledge.py build_lineage). */
export const LINEAGE_LANGUAGES_NOTE =
  "Field-level lineage is traced for COBOL programs with their SQL, files and JCL. Code in other languages (for example Java or JavaScript) shows its program-to-table links in the Dependency map instead.";
