/**
 * Deterministic cost and effort estimation for the Modernization plan.
 *
 * No AI, no backend call. Every number comes from the plan the backend already
 * produced (LOC, complexity, business rules, strategy, risk, waves) combined
 * with on-screen, user-editable assumptions (hourly rate, team size,
 * contingency, platform baseline). The formula is visible on the page so the
 * numbers can be audited.
 */

export type CostStrategy = "Retire" | "Rehost" | "Replatform" | "Refactor" | "Encapsulate";
export type CostRisk = "High" | "Medium" | "Low";

export type CostAssessment = {
  program: string;
  loc: number;
  complexity: number;
  business_rules: number;
  strategy: string;
  risk: string;
};

export type CostWave = {
  wave: number;
  name: string;
  programs: string[];
  risk: string;
};

export type CostPlanInput = {
  assessments: CostAssessment[];
  waves: CostWave[];
  services: { name: string }[];
  targets: { database: string; platform: string };
};

export type CostAssumptions = {
  /** Blended hourly rate in USD. */
  rate: number;
  /** FTEs working on the migration. Drives duration. */
  team: number;
  /** Testing effort as a fraction of development effort. */
  testFactor: number;
  /** Project-management, docs, meetings, as a fraction of total effort. */
  contingency: number;
  /** Working hours per person per month. */
  hoursPerMonth: number;
};

export const DEFAULT_ASSUMPTIONS: CostAssumptions = {
  rate: 90,
  team: 5,
  testFactor: 0.3,
  contingency: 0.15,
  hoursPerMonth: 160,
};

/** Monthly cloud/platform cost in USD, by platform + database. Conservative starting points. */
export function monthlyInfrastructure(platform: string, database: string, services: number): number {
  const platformBase: Record<string, number> = {
    azure: 900, aws: 950, gcp: 850, on_prem: 1200,
  };
  const dbSurcharge: Record<string, number> = {
    oracle: 500, azure_sql: 150, postgresql: 0, mysql: 0,
  };
  const base = (platformBase[platform] ?? 900) + (dbSurcharge[database] ?? 0);
  // Each service above the first 5 adds 5% to run-the-platform cost (log, monitoring, CI slots).
  const scale = services <= 5 ? 1 : 1 + (services - 5) * 0.05;
  return Math.round(base * scale);
}

/** Effort (hours) for one program, before risk multiplier. */
export function programBaseHours(a: CostAssessment): number {
  const loc = Math.max(0, a.loc) / 1000;
  const rules = Math.max(0, a.business_rules);
  const cx = Math.max(0, a.complexity);
  switch (a.strategy as CostStrategy) {
    case "Retire":      return 4;
    case "Rehost":      return 8 + loc * 2;
    case "Replatform":  return 20 + loc * 10 + rules * 2;
    case "Refactor":    return 40 + loc * 20 + rules * 4 + Math.max(0, cx - 10) * 1;
    case "Encapsulate": return 60 + loc * 15 + rules * 3;
    default:            return 20 + loc * 8;
  }
}

export function riskMultiplier(risk: string): number {
  if (risk === "High") return 1.4;
  if (risk === "Medium") return 1.15;
  return 1.0;
}

export type ProgramCost = {
  program: string;
  strategy: string;
  risk: string;
  hours: number;
  cost: number;
};

export type WaveCost = {
  wave: number;
  name: string;
  risk: string;
  programs: string[];
  dev_hours: number;
  overhead_hours: number;
  test_hours: number;
  total_hours: number;
  cost: number;
};

export type StrategyCost = {
  strategy: string;
  programs: number;
  hours: number;
  cost: number;
};

export type CostEstimate = {
  perProgram: ProgramCost[];
  perWave: WaveCost[];
  perStrategy: StrategyCost[];
  dev_hours: number;
  test_hours: number;
  overhead_hours: number;
  total_hours: number;
  labor_cost: number;
  monthly_infra: number;
  duration_months: number;
  infra_cost: number;
  contingency_cost: number;
  total_cost: number;
};

export function estimate(plan: CostPlanInput, a: CostAssumptions = DEFAULT_ASSUMPTIONS): CostEstimate {
  const perProgram: ProgramCost[] = plan.assessments.map((as) => {
    const hours = Math.round(programBaseHours(as) * riskMultiplier(as.risk));
    return { program: as.program, strategy: as.strategy, risk: as.risk, hours, cost: Math.round(hours * a.rate) };
  });

  // 40h base per wave, scaled by wave risk (High 1.4, Medium 1.15, Low 1.0).
  const perWave: WaveCost[] = plan.waves.map((w) => {
    const dev = perProgram.filter((p) => w.programs.includes(p.program)).reduce((s, p) => s + p.hours, 0);
    const overhead = Math.round(40 * riskMultiplier(w.risk));
    const test = Math.round(dev * a.testFactor);
    const total_hours = dev + overhead + test;
    return {
      wave: w.wave, name: w.name, risk: w.risk, programs: w.programs,
      dev_hours: dev, overhead_hours: overhead, test_hours: test, total_hours,
      cost: Math.round(total_hours * a.rate),
    };
  });

  const strategyMap = new Map<string, { programs: number; hours: number; cost: number }>();
  for (const p of perProgram) {
    const cur = strategyMap.get(p.strategy) ?? { programs: 0, hours: 0, cost: 0 };
    cur.programs += 1; cur.hours += p.hours; cur.cost += p.cost;
    strategyMap.set(p.strategy, cur);
  }
  const perStrategy: StrategyCost[] = [...strategyMap.entries()]
    .map(([strategy, v]) => ({ strategy, ...v }))
    .sort((x, y) => y.cost - x.cost);

  const dev_hours = perProgram.reduce((s, p) => s + p.hours, 0);
  const overhead_hours = perWave.reduce((s, w) => s + w.overhead_hours, 0);
  const test_hours = Math.round(dev_hours * a.testFactor);
  const total_hours = dev_hours + overhead_hours + test_hours;

  const labor_cost = Math.round(total_hours * a.rate);
  const duration_months = Math.max(2, Math.ceil(total_hours / Math.max(1, a.team) / Math.max(1, a.hoursPerMonth)));
  const monthly_infra = monthlyInfrastructure(plan.targets.platform, plan.targets.database, plan.services.length);
  const infra_cost = monthly_infra * duration_months;
  const subtotal = labor_cost + infra_cost;
  const contingency_cost = Math.round(subtotal * a.contingency);
  const total_cost = subtotal + contingency_cost;

  return {
    perProgram, perWave, perStrategy,
    dev_hours, test_hours, overhead_hours, total_hours,
    labor_cost, monthly_infra, duration_months, infra_cost, contingency_cost, total_cost,
  };
}

export function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`;
  if (Math.abs(n) >= 10_000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

export function formatHours(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k h`;
  return `${Math.round(n)} h`;
}
