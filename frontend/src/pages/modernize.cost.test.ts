import { describe, expect, it } from "vitest";
import {
  DEFAULT_ASSUMPTIONS,
  estimate,
  formatHours,
  formatMoney,
  monthlyInfrastructure,
  programBaseHours,
  riskMultiplier,
  type CostAssessment,
} from "./modernize.cost";

const p = (over: Partial<CostAssessment> = {}): CostAssessment => ({
  program: "X", loc: 1000, complexity: 10, business_rules: 0, strategy: "Rehost", risk: "Low", ...over,
});

describe("cost model", () => {
  it("retire programs are a flat 4h regardless of size", () => {
    expect(programBaseHours(p({ strategy: "Retire", loc: 10_000 }))).toBe(4);
  });
  it("refactor scales with LOC, rules and complexity above 10", () => {
    const h = programBaseHours(p({ strategy: "Refactor", loc: 2000, business_rules: 5, complexity: 20 }));
    // 40 + 2*20 + 5*4 + (20-10)*1 = 110
    expect(h).toBe(110);
  });
  it("risk multiplier: High > Medium > Low", () => {
    expect(riskMultiplier("High")).toBeGreaterThan(riskMultiplier("Medium"));
    expect(riskMultiplier("Medium")).toBeGreaterThan(riskMultiplier("Low"));
    expect(riskMultiplier("unknown")).toBe(1);
  });
  it("infrastructure adds oracle surcharge and scales with services", () => {
    const base = monthlyInfrastructure("azure", "postgresql", 3);
    const withOracle = monthlyInfrastructure("azure", "oracle", 3);
    expect(withOracle - base).toBe(500);
    const scaled = monthlyInfrastructure("azure", "postgresql", 15);
    expect(scaled).toBeGreaterThan(base);
  });
});

describe("estimate() end-to-end", () => {
  const plan = {
    targets: { language: "java", database: "postgresql", platform: "azure" },
    assessments: [
      p({ program: "A", strategy: "Refactor", loc: 2000, business_rules: 4, complexity: 15, risk: "High" }),
      p({ program: "B", strategy: "Rehost", loc: 500, risk: "Low" }),
      p({ program: "C", strategy: "Retire", loc: 300, risk: "Low" }),
    ],
    waves: [
      { wave: 1, name: "Core", programs: ["A", "B"], risk: "High" },
      { wave: 2, name: "Tail", programs: ["C"], risk: "Low" },
    ],
    services: [{ name: "s1" }, { name: "s2" }],
  };

  it("per-program hours = base × risk multiplier", () => {
    const e = estimate(plan);
    const a = e.perProgram.find((x) => x.program === "A")!;
    // base = 40 + 20*2 + 4*4 + (15-10)*1 = 101; × 1.4 = 141.4 → 141
    expect(a.hours).toBe(141);
    const c = e.perProgram.find((x) => x.program === "C")!;
    expect(c.hours).toBe(4);
  });

  it("per-wave rolls up its own programs plus overhead and test", () => {
    const e = estimate(plan);
    const w1 = e.perWave[0];
    const aHours = e.perProgram.find((x) => x.program === "A")!.hours;
    const bHours = e.perProgram.find((x) => x.program === "B")!.hours;
    expect(w1.dev_hours).toBe(aHours + bHours);
    expect(w1.overhead_hours).toBe(Math.round(40 * 1.4));
    expect(w1.test_hours).toBe(Math.round(w1.dev_hours * DEFAULT_ASSUMPTIONS.testFactor));
    expect(w1.total_hours).toBe(w1.dev_hours + w1.overhead_hours + w1.test_hours);
  });

  it("totals: labor + infra × duration + contingency", () => {
    const e = estimate(plan);
    expect(e.total_hours).toBe(e.dev_hours + e.overhead_hours + e.test_hours);
    expect(e.labor_cost).toBe(Math.round(e.total_hours * DEFAULT_ASSUMPTIONS.rate));
    expect(e.duration_months).toBeGreaterThanOrEqual(2);
    expect(e.infra_cost).toBe(e.monthly_infra * e.duration_months);
    const subtotal = e.labor_cost + e.infra_cost;
    expect(e.contingency_cost).toBe(Math.round(subtotal * DEFAULT_ASSUMPTIONS.contingency));
    expect(e.total_cost).toBe(subtotal + e.contingency_cost);
  });

  it("per-strategy summary covers every strategy and is ordered by cost", () => {
    const e = estimate(plan);
    const strategies = e.perStrategy.map((s) => s.strategy);
    expect(new Set(strategies).size).toBe(strategies.length);
    expect(strategies).toContain("Refactor");
    expect(strategies).toContain("Rehost");
    expect(strategies).toContain("Retire");
    const costs = e.perStrategy.map((s) => s.cost);
    const sorted = [...costs].sort((a, b) => b - a);
    expect(costs).toEqual(sorted);
  });

  it("empty plan returns zero totals, non-negative duration", () => {
    const empty = { targets: { database: "postgresql", platform: "azure" }, assessments: [], waves: [], services: [] };
    const e = estimate(empty);
    expect(e.total_hours).toBe(0);
    expect(e.labor_cost).toBe(0);
    expect(e.duration_months).toBe(2);   // clamped minimum
  });
});

describe("formatters", () => {
  it("money in human units", () => {
    expect(formatMoney(500)).toBe("$500");
    expect(formatMoney(15_400)).toBe("$15k");
    expect(formatMoney(1_250_000)).toBe("$1.25M");
    expect(formatMoney(NaN)).toBe("—");
  });
  it("hours in human units", () => {
    expect(formatHours(240)).toBe("240 h");
    expect(formatHours(2400)).toBe("2.4k h");
  });
});
