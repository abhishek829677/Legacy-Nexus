/**
 * All explanatory text for the Modernize page lives here.
 * Dynamic text is built from values in the active plan only; a missing value becomes NOT_AVAILABLE.
 * Formulas mirror backend/app/engine/modernization.py `_readiness` exactly; update both together.
 */
import { fmtAvg, fmtInt, fmtOf, isNum, plural, scoreBand, type Band } from "./modernize.format";

export const NOT_AVAILABLE = "Not available for this plan.";

/* ---------------- types of the values the text is built from ---------------- */
export type FactorKey = "code_complexity" | "rule_traceability" | "self_documentation" | "interface_clarity" | "static_resolvability";
export type FactorInputs = Partial<{
  avg_cyclomatic_complexity: number;
  programs_counted: number;
  rules_total: number;
  business_rules: number;
  technical_rules: number | null;
  programs_with_purpose: number;
  programs_total: number;
  undocumented_interfaces: number;
  total_interfaces: number;
  dynamic_calls: number;
}>;

type MetricCopy = {
  label: string;
  measures: string;
  result: (i: FactorInputs | undefined) => string;
  meaning?: (score: number | undefined) => string; // overrides the shared meaning when a factor works differently
  next: (i: FactorInputs | undefined, score: number | undefined) => string;
  formula: string;
  variables: string[];
};

/* ---------------- headings and shared labels ---------------- */
export const READINESS = {
  heading: "Migration readiness",
  technicalName: "Readiness score",
  scaleNote: "Score out of 100. Higher means readier.",
  targetsNote: (language: string, platform: string, database: string) =>
    `Plan for ${language} on ${platform} with ${database}. The readiness score comes from the code only; changing the targets does not change it.`,
  factorsHeading: "What the score is made of",
  weightLabel: "Weight",
  sections: {
    measures: "What it measures",
    result: "Your result",
    meaning: "What this score means",
    next: "What to do next",
    formula: "How is this score calculated?",
    variables: "In plain words",
  },
  aboutLabel: (name: string) => `About ${name}`,
  barLabel: (name: string, score: string) => `${name}: ${score}`,
  overall: {
    measures: "How ready this codebase is for migration, as one number from 0 to 100. Higher means readier.",
    result: (score: string, level: string) => `${score}, which is “${level}”.`,
    meaning: "75 or more: Ready. 50 to 74: Needs preparation. Below 50: High effort.",
    next: "Start with the factors marked “Needs attention” below. Open the ⓘ next to each one for the next step.",
    formula: "Overall score = average of the 5 factor scores, rounded. Every factor has the same weight.",
    variables: [
      "The score is worked out from the analysed code, rules and interfaces only.",
      "The chosen target language, database and platform do not change it.",
    ],
  },
  /** Status text shown next to every bar, so status never depends on colour alone. */
  band: { good: "Good", prep: "Needs preparation", attention: "Needs attention" } as Record<Band, string>,
  bandMeaning: {
    good: "Good. This factor is not holding back the migration.",
    prep: "Needs preparation. Worth improving before migration starts.",
    attention: "Needs attention. This factor is lowering readiness the most.",
  } as Record<Band, string>,
  bandRule: "Status cut-offs: 75 or more is Good, 50 to 74 Needs preparation, below 50 Needs attention (the same cut-offs as the overall level).",
  unknownFactor: {
    measures: NOT_AVAILABLE,
    result: NOT_AVAILABLE,
    next: NOT_AVAILABLE,
  },
};

/** Shared "what this score means" text: higher is readier for every factor (verified in _readiness). */
export function scoreMeaning(score: number | undefined): string {
  const band = scoreBand(score);
  return band ? READINESS.bandMeaning[band] : NOT_AVAILABLE;
}

/* ---------------- one entry per readiness factor ---------------- */
export const METRICS: Record<FactorKey, MetricCopy> = {
  code_complexity: {
    label: "Code complexity",
    measures: "How structurally complex the programs are. Complex code is harder to understand, test and modernize.",
    result: (i) => {
      const avg = fmtAvg(i?.avg_cyclomatic_complexity);
      const n = i?.programs_counted;
      if (!avg || !isNum(n)) return NOT_AVAILABLE;
      if (n === 0) return "No programs were analysed, so there is no complexity to average.";
      return `Average cyclomatic complexity: ${avg} across ${fmtInt(n)} ${plural(n, "program", "programs")}.`;
    },
    next: () => "Check the Complexity column in the Program assessment table below to find the programs that pull this score down.",
    formula: "Score = 100 − (average cyclomatic complexity × 3), never below 0.",
    variables: [
      "Cyclomatic complexity: the number of independent paths through a program's decisions.",
      "The average is taken over every analysed program.",
      "An average above 33 gives a score of 0.",
    ],
  },
  rule_traceability: {
    label: "Rule traceability",
    measures: "Whether business rules could be extracted from the code and linked to the source lines they come from.",
    result: (i) => {
      const total = i?.rules_total;
      if (!isNum(total)) return NOT_AVAILABLE;
      if (total === 0) return "No rules were extracted from the code.";
      const parts: string[] = [];
      if (isNum(i?.business_rules)) parts.push(`${fmtInt(i!.business_rules)} business ${plural(i!.business_rules!, "rule", "rules")}`);
      if (isNum(i?.technical_rules)) parts.push(`${fmtInt(i!.technical_rules)} technical ${plural(i!.technical_rules!, "rule", "rules")}`);
      const head = `${fmtInt(total)} ${plural(total, "rule", "rules")} extracted and linked to source lines`;
      return parts.length ? `${head}: ${parts.join(" and ")}.` : `${head}.`;
    },
    meaning: (score) => {
      if (!isNum(score)) return NOT_AVAILABLE;
      const base = "This score is either 100 (rules were found) or 40 (none were found). It does not grade how many rules there are.";
      return score >= 75 ? `Good. ${base}` : `Needs attention. ${base}`;
    },
    next: (i) =>
      isNum(i?.rules_total) && i!.rules_total! > 0
        ? "Download the parity pack (CSV or Gherkin) on this page to get test scenarios generated from these rules."
        : "Check that the program source code was uploaded, then run the analysis again.",
    formula: "Score = 100 if at least one rule (business or technical) was extracted, otherwise 40.",
    variables: [
      "Business rule: a decision, calculation or validation that reflects business policy.",
      "Technical rule: logic about how the program works rather than business policy.",
      "Every extracted rule records the file and lines it came from.",
    ],
  },
  self_documentation: {
    label: "Self-documentation",
    measures: "How much of the code states its own purpose in a header comment.",
    result: (i) => {
      const of = fmtOf(i?.programs_with_purpose, i?.programs_total);
      if (!of) return NOT_AVAILABLE;
      return `${of.part} of ${of.total} ${plural(of.totalN, "program has", "programs have")} a purpose header.`;
    },
    next: () => "Programs without a purpose header need a short description before migration. Click a program in the Program assessment table below to open its source.",
    formula: "Score = (programs with a purpose header ÷ all programs) × 100, rounded.",
    variables: ["Purpose header: a comment at the top of a program that says what it does."],
  },
  interface_clarity: {
    label: "Interface clarity",
    measures: "How well the external systems and APIs this code talks to are documented.",
    result: (i) => {
      const u = i?.undocumented_interfaces;
      const t = i?.total_interfaces;
      if (!isNum(u)) return NOT_AVAILABLE;
      if (isNum(t) && t === 0) return "No external interfaces were found.";
      if (u === 0) return isNum(t) ? `No undocumented interfaces. All ${fmtInt(t)} external ${plural(t, "interface has", "interfaces have")} a specification.` : "No undocumented interfaces.";
      const of = fmtOf(u, t);
      return of
        ? `${of.part} of ${of.total} external ${plural(of.totalN, "interface has", "interfaces have")} no specification.`
        : `${fmtInt(u)} external ${plural(u, "interface has", "interfaces have")} no specification.`;
    },
    next: (i) =>
      isNum(i?.undocumented_interfaces) && i!.undocumented_interfaces! > 0
        ? "Open Risks to address below to see which programs use each undocumented interface. Upload its specification (for example an OpenAPI file) and run the analysis again."
        : "No action needed for interfaces.",
    formula: "Score = 100 − (undocumented interfaces × 15), never below 0.",
    variables: [
      "Undocumented interface: an external API or system the code uses, with no uploaded specification.",
      "7 or more undocumented interfaces give a score of 0.",
    ],
  },
  static_resolvability: {
    label: "Static resolvability",
    measures: "How easily calls between programs can be traced from the code alone, without running the application.",
    result: (i) => {
      const n = i?.dynamic_calls;
      if (!isNum(n)) return NOT_AVAILABLE;
      if (n === 0) return "No calls that can't be resolved without running the app.";
      return `${fmtInt(n)} ${plural(n, "call", "calls")} that can't be resolved without running the app.`;
    },
    next: (i) =>
      isNum(i?.dynamic_calls) && i!.dynamic_calls! > 0
        ? "Open Risks to address below: each dynamic CALL is listed with its program, file and line."
        : "No action needed for call tracing.",
    formula: "Score = 100 − (dynamic calls × 20), never below 0.",
    variables: [
      "Dynamic call (technical term: dynamic CALL): the program to call is held in a variable, so it is only known at run time.",
      "5 or more dynamic calls give a score of 0.",
    ],
  },
};

export const isFactorKey = (k: unknown): k is FactorKey => typeof k === "string" && k in METRICS;

/* =====================================================================================
 * Page-wide text (Checkpoint 3). Rules, thresholds and orderings below mirror
 * backend/app/engine/modernization.py (_strategy, _risk, _waves, _convert_ddl, parity_tests).
 * ===================================================================================== */

/** One explained result: the ⓘ panel shows these five parts, plus optional details. */
export type Topic = {
  title: string;
  what: string;
  meaning: string;
  evidence: string;
  impact: string;
  next: string;
  details?: { heading: string; items: string[] };
};

export const TOPIC_SECTIONS = {
  what: "What this shows",
  meaning: "What it means",
  evidence: "Where it comes from",
  impact: "Why it matters",
  next: "What to do next",
};

const count = (n: number, one: string, many: string) => `${fmtInt(n)} ${plural(n, one, many)}`;

export const PAGE = {
  title: "Modernization",
  heading: "Modernization plan",
  intro: "Choose a target stack and generate a plan. Everything on this page is worked out from the analysed code and the extracted business rules.",
  helpButton: "How this page works",
  aboutLabel: (name: string) => `About ${name}`,
  notGeneratedYet: "Generate the plan to see this section.",
  nextPrefix: "Next:",

  /* ---------- the five steps ---------- */
  steps: {
    targets: {
      n: 1,
      title: "Choose your target stack",
      description: "Pick the language, database and cloud platform you are moving to.",
      next: "press Generate plan.",
    },
    review: {
      n: 2,
      title: "Review the modernization plan",
      description: "How ready the code is for migration, and how each program will be migrated.",
      next: "open the ⓘ beside any factor marked Needs attention.",
    },
    explore: {
      n: 3,
      title: "Explore the analysis and recommendations",
      description: "Target architecture, proposed services, every program, the converted database schema and the risks to address.",
      next: "work through the High risks at the end of this section.",
    },
    roadmap: {
      n: 4,
      title: "Plan the migration",
      description: "The order in which programs move, in waves.",
      next: "download the parity pack below to test each wave.",
    },
    verify: {
      n: 5,
      title: "Verify results",
      description: "Test scenarios that check the new system behaves like the old one.",
      next: "run the scenarios against both systems and compare the outputs.",
    },
  },

  /* ---------- step 1: targets ---------- */
  targets: {
    fields: { language: "Target language", database: "Target database", platform: "Target platform" },
    generate: "Generate plan",
    topic: {
      title: "Target stack",
      what: "The language, database and cloud platform you want to move to.",
      meaning: "The language changes the proposed services, batch framework and code mappings. The database changes the SQL dialect of the converted schema. The platform changes hosting, API gateway, messaging, file storage and scheduling.",
      evidence: "The options and product names come from LegacyNexus's target catalogue.",
      impact: "Readiness, the strategy for each program, the risks and the migration waves come from the code only. They do not change when you change the targets.",
      next: "Pick the targets, then press Generate plan. It takes about a second and uses no AI.",
    } as Topic,
  },

  /* ---------- plan state ---------- */
  empty: "Pick the targets and press Generate plan. It takes about a second and uses no AI.",
  loading: "Generating the plan",
  error: (message: string) =>
    `The plan could not be generated: ${message} If the analysis is still running or has failed, open the project dashboard and run it again, then try once more.`,
  stale: {
    text: "Your selections have changed. Generate the plan again to update your results.",
    current: (language: string, database: string, platform: string) => `The results below are still for ${language}, ${database} and ${platform}.`,
    action: "Generate plan again",
  },
  summary: {
    label: "Plan summary",
    language: "Target language",
    database: "Target database",
    platform: "Target platform",
    programs: "Programs assessed",
  },

  /* ---------- step 2: review ---------- */
  review: {
    topic: {
      title: "Review the modernization plan",
      what: "A summary of the plan: how ready the code is, and the migration strategy chosen for each program.",
      meaning: "Migration readiness is a score out of 100; higher is readier. The strategy says whether each program is retired, moved as-is, moved with small changes, rewritten as a service, or wrapped behind an API.",
      evidence: "Computed from the knowledge graph and the extracted business rules. No AI is used.",
      impact: "Low readiness, or many programs marked Refactor or Encapsulate, means more preparation and testing before migration.",
      next: "Open the ⓘ next to each readiness factor and next to the strategy summary.",
    } as Topic,
  },
  strategy: {
    heading: "How each program will be migrated",
    caption: (programs: number) => `${count(programs, "program", "programs")} assessed. Each program gets exactly one strategy.`,
    tag: (strategy: string, n: number) => `${strategy} · ${count(n, "program", "programs")}`,
    topic: {
      title: "How each program will be migrated",
      what: "How many programs get each migration strategy.",
      meaning: "Each program gets one strategy. The rules are checked in the order shown in the details below, and the first one that fits decides.",
      evidence: "Worked out from each program's callers, complexity, type and business rules in the knowledge graph.",
      impact: "Refactor and Encapsulate programs need the most work and parity testing. Retire programs can be removed first, which shrinks the migration.",
      next: "See the strategy and the reason for every program in the Program assessment table in step 3.",
      details: {
        heading: "Strategy rules (technical name: strategy mix)",
        items: [
          "Retire: nothing calls it, runs it or exposes it. Confirm with operations logs, then decommission it.",
          "Encapsulate: complexity of 25 or more and 3 or more callers. Wrap it behind an API first, rewrite it later.",
          "Replatform: a batch program with 3 or fewer business rules. Move it to the target batch framework with minimal change.",
          "Refactor: it contains business rules or other programs call it. Re-implement it as a service, checked with parity tests.",
          "Rehost: everything else (little logic, few links). Run it as-is on the target platform.",
        ],
      },
    } as Topic,
  },

  /* ---------- step 3: explore ---------- */
  explore: {
    topic: {
      title: "Explore the analysis and recommendations",
      what: "The proposed target design and everything found about the current code.",
      meaning: "Architecture and services describe the new system. Program assessment, database schema and risks describe the current one.",
      evidence: "From the knowledge graph, the uploaded DDL and the target catalogue for your chosen stack.",
      impact: "These are the inputs for estimating the work, which this page does not do.",
      next: "Start with Risks to address, then check each program's strategy.",
    } as Topic,
  },
  architecture: {
    heading: "Target architecture",
    topic: {
      title: "Target architecture",
      what: "The proposed layers of the new system, from user channels down to the platform.",
      meaning: "The Services layer has one service per business capability in use. The Batch layer has one job per legacy batch job. The other boxes come from the chosen language and platform.",
      evidence: "Capabilities and jobs come from the knowledge graph. Product names come from the target catalogue.",
      impact: "This is a starting design to review with your architects.",
      next: "Check Proposed services to see which programs and tables each service takes over.",
    } as Topic,
  },
  mapping: {
    heading: "Legacy to target mapping",
    legacy: "Legacy",
    target: "Target",
    topic: {
      title: "Legacy to target mapping",
      what: "How each legacy building block translates into the target stack.",
      meaning: "Each row pairs a legacy concept (left) with what replaces it in the chosen language, database and platform (right).",
      evidence: "From the target catalogue for the chosen language, database and platform.",
      impact: "Packed-decimal (COMP-3) numbers must map to exact decimal types so rounding stays the same.",
      next: "Share this table with the developers who will rewrite the code.",
    } as Topic,
  },
  services: {
    heading: "Proposed services",
    caption: (n: number) => count(n, "proposed service", "proposed services"),
    columns: { service: "Service", replaces: "Replaces", owns: "Owns data", endpoints: "Endpoints" },
    noTables: "No tables",
    batchOnly: (jobs: string[]) => (jobs.length ? `Batch only (${jobs.join(", ")})` : "Batch only"),
    empty: "No services were proposed, because no business capability in use was found.",
    topic: {
      title: "Proposed services",
      what: "One proposed service per business capability that is still in use.",
      meaning: "Replaces: the programs it takes over. Owns data: the tables it becomes responsible for. Endpoints: one per called subprogram (POST if it writes tables, otherwise GET), plus the operations of existing APIs. Batch only: the service has no endpoints.",
      evidence: "Capabilities, programs, tables and APIs come from the knowledge graph.",
      impact: "Each table should be changed by only one service, so agree ownership early.",
      next: "Use this list to plan teams and to agree the API contracts first.",
    } as Topic,
  },
  assessment: {
    heading: "Program assessment",
    caption: "Click a row or a program name to open its source code.",
    openSource: (program: string) => `Open the source code of ${program}`,
    columns: { program: "Program", criticality: "Criticality", loc: "Lines of code", complexity: "Complexity", rules: "Business rules", strategy: "Strategy", risk: "Risk", target: "Target" },
    empty: "No programs were assessed.",
    topic: {
      title: "Program assessment",
      what: "Every analysed program with its size, complexity, business rules, strategy and risk.",
      meaning: "Criticality: how important the program is compared with the others. Complexity: cyclomatic complexity, the number of independent decision paths. Business rules: rules found in the program. Risk: High, Medium or Low, from the formula in the details.",
      evidence: "From the parsed source of each program and the knowledge graph.",
      impact: "High-risk programs need the most review and testing.",
      next: "Click a row to open the program's source code.",
      details: {
        heading: "How program risk is calculated",
        items: [
          "Risk points = complexity ÷ 10 + callers + output datasets + business rules ÷ 4 + CICS commands + 2 × dynamic calls.",
          "High: 6 points or more. Medium: 3 to under 6. Low: under 3.",
        ],
      },
    } as Topic,
  },
  schema: {
    heading: "Database schema (SQL)",
    caption: (converted: number, total: number) => {
      const manual = total - converted;
      const head = `${fmtInt(converted)} of ${count(total, "table", "tables")} converted automatically`;
      return manual > 0 ? `${head}; ${fmtInt(manual)} ${plural(manual, "needs", "need")} manual conversion. Review before use.` : `${head}. Review before use.`;
    },
    source: "Uploaded DDL",
    target: (database: string) => `Converted for ${database}`,
    status: { converted: "Converted", manual: "Manual conversion needed" } as Record<string, string>,
    empty: "No database schema (DDL) was uploaded, so there is nothing to convert. Upload your CREATE TABLE files and run the analysis again.",
    topic: {
      title: "Database schema (SQL)",
      what: "Each uploaded CREATE TABLE statement next to its automatic conversion for the target database.",
      meaning: "Converted: translated automatically. Manual conversion needed: the statement could not be translated; the reason is shown in the right-hand pane.",
      evidence: "Converted with the sqlglot SQL translator from the DDL files you uploaded.",
      impact: "Automatic conversion can still get data types and defaults wrong, so every statement needs review.",
      next: "Review each converted statement, and convert the ones marked Manual conversion needed by hand.",
      details: { heading: "Technical name", items: ["DDL (data definition language): the SQL that defines tables and columns."] },
    } as Topic,
  },
  risks: {
    heading: "Risks to address",
    caption: (bySeverity: [string, number][]) => bySeverity.map(([s, n]) => `${fmtInt(n)} ${s.toLowerCase()}`).join(", "),
    evidence: "Evidence:",
    empty: "No specific risks were detected.",
    topic: {
      title: "Risks to address",
      what: "Specific problems found in the code that must be handled before or during migration, High first.",
      meaning: "Each risk says what was found and where: an undocumented interface, a table without DDL, missing source, a dynamic call, packed-decimal arithmetic or a high-risk program.",
      evidence: "The evidence line names the program, interface, table, or file and line it comes from.",
      impact: "Undocumented interfaces and missing source must be resolved before the affected programs can be migrated.",
      next: "Work through High risks first. Open the program from the Program assessment table to see its code.",
    } as Topic,
  },

  /* ---------- step 4: roadmap ---------- */
  waves: {
    heading: "Migration waves",
    caption: (n: number) => `${count(n, "wave", "waves")}. Foundation capabilities first.`,
    risk: (level: string) => `${level} risk`,
    rulesToVerify: (n: number) => `${count(n, "business rule", "business rules")} to verify`,
    empty: "No migration waves: no programs in use were found.",
    topic: {
      title: "Migration waves",
      what: "The suggested order for moving the programs, one business capability per wave.",
      meaning: "Wave 0 retires unused programs. Later waves follow the application map: foundation capabilities first, then the ones that depend on them. Old and new run side by side until cut-over (strangler pattern).",
      evidence: "The order comes from the application map in the knowledge graph. A wave's risk is the highest program risk in it. Business rules to verify counts the business rules in the wave's programs.",
      impact: "Each wave ends with a side-by-side comparison and cut-over, so problems stay contained to one capability.",
      next: "Download the parity pack in step 5 to test each wave's business rules.",
      details: { heading: "What is not included", items: ["This plan does not estimate effort, cost or duration."] },
    } as Topic,
  },

  /* ---------- cost & effort estimate (inside step 4) ---------- */
  cost: {
    heading: "Estimated effort and cost",
    caption: "A planning estimate built from the programs, strategies and risks above. Edit the assumptions to fit your team.",
  },

  /* ---------- step 5: verify ---------- */
  parity: {
    heading: "Behavioural parity pack",
    caption: (scenarios: number, rules: number) =>
      scenarios === 0
        ? "No test scenarios: no business rules were extracted."
        : `${count(scenarios, "test scenario", "test scenarios")} covering ${count(rules, "business rule", "business rules")}, each traced to its source lines.`,
    csv: "Download CSV",
    gherkin: "Download Gherkin (.feature)",
    topic: {
      title: "Behavioural parity pack",
      what: "Test scenarios generated from the business rules, to prove the new system behaves like the old one.",
      meaning: "Decision rules get two scenarios (condition true and false), classification rules one per branch, and calculation and allowed-value rules one each. Technical rules are skipped.",
      evidence: "Every scenario names the source file and lines of the rule it tests.",
      impact: "Matching outputs on these scenarios is the evidence that a wave is safe to cut over.",
      next: "Download the pack, run each scenario against the legacy and the new system, and compare the outputs.",
      details: {
        heading: "Formats",
        items: [
          "CSV: one row per scenario, for spreadsheets and test-management tools.",
          "Gherkin (.feature): Given / When / Then scenarios for BDD tools such as Cucumber.",
          "This page does not run tests or store test results.",
        ],
      },
    } as Topic,
  },

  toasts: {
    downloadFailed: (message: string) => `${message}. Try again.`,
  },
};

/* ---------- first-time walkthrough (shown once per user; reopen with "How this page works") ---------- */
export const TOUR_KEY = "modernize-v2";
export const TOUR = [
  { target: "mod-targets", title: "1. Choose your target stack", body: "Language, database and cloud platform. They change the services, schema and hosting, but not the readiness score." },
  { target: "mod-generate", title: "Generate the plan", body: "Builds the plan from the analysed code in about a second. No AI is used. Press it again after changing the targets." },
  { target: "mod-review", title: "2. Review the plan", body: "Migration readiness out of 100 and the strategy for each program. Every score has an ⓘ that explains it." },
  { target: "mod-explore", title: "3. Explore the analysis", body: "Target architecture, proposed services, every program with its risk, the converted database schema and the risks to address." },
  { target: "mod-roadmap", title: "4. Plan the migration", body: "Migration waves: unused programs are retired first, then capabilities move in dependency order." },
  { target: "mod-verify", title: "5. Verify results", body: "Download test scenarios generated from the business rules and run them against the old and the new system." },
  { target: "mod-help", title: "Open this guide again", body: "Press How this page works at any time. Look for the ⓘ buttons next to results for details." },
];
