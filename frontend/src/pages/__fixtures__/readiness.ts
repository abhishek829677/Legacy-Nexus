// Readiness objects copied verbatim from live POST /api/projects/{id}/modernization responses
// (java / postgresql / azure) on 2026-11-04. Used only by tests.
import type { Readiness } from "../ReadinessPanel";

export const PLAN_1_SAMPLE: Readiness = {
  score: 98,
  level: "Ready",
  factors: [
    { key: "code_complexity", name: "Code complexity", score: 88, detail: "Average cyclomatic complexity 4.0", weight: 0.2, inputs: { avg_cyclomatic_complexity: 4.0, programs_counted: 6 } },
    { key: "rule_traceability", name: "Rule traceability", score: 100, detail: "19 business rules linked to source lines", weight: 0.2, inputs: { rules_total: 21, business_rules: 19, technical_rules: 2 } },
    { key: "self_documentation", name: "Self-documentation", score: 100, detail: "100% of programs have a purpose header", weight: 0.2, inputs: { programs_with_purpose: 6, programs_total: 6 } },
    { key: "interface_clarity", name: "Interface clarity", score: 100, detail: "0 interface(s) used without a specification", weight: 0.2, inputs: { undocumented_interfaces: 0, total_interfaces: 1 } },
    { key: "static_resolvability", name: "Static resolvability", score: 100, detail: "0 dynamic CALL(s) that cannot be resolved statically", weight: 0.2, inputs: { dynamic_calls: 0 } },
  ],
};

export const PLAN_2_AWS: Readiness = {
  score: 30,
  level: "High effort",
  factors: [
    { key: "code_complexity", name: "Code complexity", score: 0, detail: "Average cyclomatic complexity 52.0", weight: 0.2, inputs: { avg_cyclomatic_complexity: 52.03804565478574, programs_counted: 2497 } },
    { key: "rule_traceability", name: "Rule traceability", score: 100, detail: "130472 business rules linked to source lines", weight: 0.2, inputs: { rules_total: 130494, business_rules: 130472, technical_rules: 22 } },
    { key: "self_documentation", name: "Self-documentation", score: 48, detail: "48% of programs have a purpose header", weight: 0.2, inputs: { programs_with_purpose: 1211, programs_total: 2497 } },
    { key: "interface_clarity", name: "Interface clarity", score: 0, detail: "9 interface(s) used without a specification", weight: 0.2, inputs: { undocumented_interfaces: 9, total_interfaces: 9 } },
    { key: "static_resolvability", name: "Static resolvability", score: 0, detail: "1177 dynamic CALL(s) that cannot be resolved statically", weight: 0.2, inputs: { dynamic_calls: 1177 } },
  ],
};
