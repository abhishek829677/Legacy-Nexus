import { describe, expect, it } from "vitest";
import { METRICS, NOT_AVAILABLE, scoreMeaning } from "./modernize.copy";
import { fmtAvg, fmtInt, fmtOf, fmtScore, fmtWeight, plural, scoreBand, selectionsChanged } from "./modernize.format";

describe("selectionsChanged", () => {
  const a = { language: "java", database: "postgresql", platform: "azure" };
  it("is false before any plan, and for the selections the plan used", () => {
    expect(selectionsChanged(null, a)).toBe(false);
    expect(selectionsChanged(a, { ...a })).toBe(false);
  });
  it("is true when any selection differs", () => {
    expect(selectionsChanged(a, { ...a, database: "oracle" })).toBe(true);
    expect(selectionsChanged(a, { ...a, platform: "aws" })).toBe(true);
    expect(selectionsChanged(a, { ...a, language: "python" })).toBe(true);
  });
});

describe("formatters", () => {
  it("formats integers and never invents a value", () => {
    expect(fmtInt(0)).toBe("0");
    expect(fmtInt(1)).toBe("1");
    expect(fmtInt(1177)).toBe("1,177");
    expect(fmtInt(null)).toBeNull();
    expect(fmtInt(undefined)).toBeNull();
    expect(fmtInt(Number.NaN)).toBeNull();
    expect(fmtInt("12")).toBeNull();
  });

  it("formats averages with one decimal", () => {
    expect(fmtAvg(52.03804565478574)).toBe("52.0");
    expect(fmtAvg(4)).toBe("4.0");
    expect(fmtAvg(0)).toBe("0.0");
    expect(fmtAvg(null)).toBeNull();
  });

  it("formats 0-100 scores as x / 100", () => {
    expect(fmtScore(0)).toBe("0 / 100");
    expect(fmtScore(72)).toBe("72 / 100");
    expect(fmtScore(100)).toBe("100 / 100");
    expect(fmtScore(undefined)).toBeNull();
  });

  it("converts 0-1 weights only, and rejects values on a 0-100 scale", () => {
    expect(fmtWeight(0.2)).toBe("20%");
    expect(fmtWeight(0)).toBe("0%");
    expect(fmtWeight(1)).toBe("100%");
    expect(fmtWeight(20)).toBeNull();
    expect(fmtWeight(null)).toBeNull();
  });

  it("pluralises 0, 1 and many", () => {
    expect(plural(0, "call", "calls")).toBe("calls");
    expect(plural(1, "call", "calls")).toBe("call");
    expect(plural(3, "call", "calls")).toBe("calls");
  });

  it("builds 'x of y' without dividing, and refuses a zero or missing total", () => {
    expect(fmtOf(14, 20)).toEqual({ part: "14", total: "20", totalN: 20 });
    expect(fmtOf(0, 20)).toEqual({ part: "0", total: "20", totalN: 20 });
    expect(fmtOf(5, 0)).toBeNull();
    expect(fmtOf(5, undefined)).toBeNull();
    expect(fmtOf(null, 5)).toBeNull();
  });

  it("uses the 75 / 50 cut-offs", () => {
    expect(scoreBand(75)).toBe("good");
    expect(scoreBand(74)).toBe("prep");
    expect(scoreBand(50)).toBe("prep");
    expect(scoreBand(49)).toBe("attention");
    expect(scoreBand(0)).toBe("attention");
    expect(scoreBand(undefined)).toBeNull();
    expect(scoreMeaning(undefined)).toBe(NOT_AVAILABLE);
  });
});

describe("metric result text", () => {
  it("static resolvability: none / one / many / missing", () => {
    const r = METRICS.static_resolvability.result;
    expect(r({ dynamic_calls: 0 })).toBe("No calls that can't be resolved without running the app.");
    expect(r({ dynamic_calls: 1 })).toBe("1 call that can't be resolved without running the app.");
    expect(r({ dynamic_calls: 1177 })).toBe("1,177 calls that can't be resolved without running the app.");
    expect(r({})).toBe(NOT_AVAILABLE);
    expect(r(undefined)).toBe(NOT_AVAILABLE);
  });

  it("interface clarity: none found / all documented / some undocumented / missing", () => {
    const r = METRICS.interface_clarity.result;
    expect(r({ undocumented_interfaces: 0, total_interfaces: 0 })).toBe("No external interfaces were found.");
    expect(r({ undocumented_interfaces: 0, total_interfaces: 1 })).toBe("No undocumented interfaces. All 1 external interface has a specification.");
    expect(r({ undocumented_interfaces: 1, total_interfaces: 1 })).toBe("1 of 1 external interface has no specification.");
    expect(r({ undocumented_interfaces: 9, total_interfaces: 9 })).toBe("9 of 9 external interfaces have no specification.");
    expect(r({ total_interfaces: 9 })).toBe(NOT_AVAILABLE);
  });

  it("self-documentation: ratio, zero total, missing", () => {
    const r = METRICS.self_documentation.result;
    expect(r({ programs_with_purpose: 1211, programs_total: 2497 })).toBe("1,211 of 2,497 programs have a purpose header.");
    expect(r({ programs_with_purpose: 0, programs_total: 1 })).toBe("0 of 1 program has a purpose header.");
    expect(r({ programs_with_purpose: 0, programs_total: 0 })).toBe(NOT_AVAILABLE);
    expect(r({ programs_total: 3 })).toBe(NOT_AVAILABLE);
  });

  it("rule traceability: none / one / many / missing", () => {
    const r = METRICS.rule_traceability.result;
    expect(r({ rules_total: 0, business_rules: 0, technical_rules: 0 })).toBe("No rules were extracted from the code.");
    expect(r({ rules_total: 1, business_rules: 1, technical_rules: 0 })).toBe("1 rule extracted and linked to source lines: 1 business rule and 0 technical rules.");
    expect(r({ rules_total: 21, business_rules: 19, technical_rules: 2 })).toBe("21 rules extracted and linked to source lines: 19 business rules and 2 technical rules.");
    expect(r({ rules_total: 5 })).toBe("5 rules extracted and linked to source lines.");
    expect(r({})).toBe(NOT_AVAILABLE);
    expect(METRICS.rule_traceability.meaning!(40)).toMatch(/^Needs attention\./);
  });

  it("code complexity: average, zero programs, missing", () => {
    const r = METRICS.code_complexity.result;
    expect(r({ avg_cyclomatic_complexity: 52.03804565478574, programs_counted: 2497 })).toBe("Average cyclomatic complexity: 52.0 across 2,497 programs.");
    expect(r({ avg_cyclomatic_complexity: 4, programs_counted: 1 })).toBe("Average cyclomatic complexity: 4.0 across 1 program.");
    expect(r({ avg_cyclomatic_complexity: 0, programs_counted: 0 })).toBe("No programs were analysed, so there is no complexity to average.");
    expect(r({ programs_counted: 3 })).toBe(NOT_AVAILABLE);
  });
});
