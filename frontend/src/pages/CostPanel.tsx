import { useMemo, useState } from "react";
import { LuChevronDown, LuChevronRight, LuDollarSign } from "react-icons/lu";
import {
  DEFAULT_ASSUMPTIONS, estimate, formatHours, formatMoney,
  type CostAssumptions, type CostPlanInput,
} from "./modernize.cost";

export function CostPanel({ plan }: { plan: CostPlanInput }) {
  const [a, setA] = useState<CostAssumptions>(DEFAULT_ASSUMPTIONS);
  const [showDetails, setShowDetails] = useState(false);

  const est = useMemo(() => estimate(plan, a), [plan, a]);
  const maxStrategyCost = est.perStrategy.reduce((m, s) => Math.max(m, s.cost), 1);

  const num = (v: number, min: number, max: number, step: number, set: (n: number) => void, suffix: string, id: string) => (
    <div className="cost-input">
      <label htmlFor={id}>{suffix}</label>
      <input
        id={id} type="number" min={min} max={max} step={step} value={v}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) set(Math.min(max, Math.max(min, n)));
        }}
      />
    </div>
  );

  return (
    <div className="cost-panel">
      <div className="cost-kpis">
        <div className="cost-kpi cost-kpi-primary">
          <div className="k">Estimated total</div>
          <div className="v" title={`$${est.total_cost.toLocaleString()}`}>
            <LuDollarSign size={18} aria-hidden="true" />
            {formatMoney(est.total_cost)}
          </div>
          <div className="sub">labor + infrastructure + contingency</div>
        </div>
        <div className="cost-kpi">
          <div className="k">Effort</div>
          <div className="v">{formatHours(est.total_hours)}</div>
          <div className="sub">dev {formatHours(est.dev_hours)} · test {formatHours(est.test_hours)} · overhead {formatHours(est.overhead_hours)}</div>
        </div>
        <div className="cost-kpi">
          <div className="k">Duration</div>
          <div className="v">{est.duration_months} mo</div>
          <div className="sub">team of {a.team} · {a.hoursPerMonth} h/person/mo</div>
        </div>
        <div className="cost-kpi">
          <div className="k">Monthly infrastructure</div>
          <div className="v">{formatMoney(est.monthly_infra)}</div>
          <div className="sub">{plan.services.length} service(s) on {plan.targets.platform}</div>
        </div>
      </div>

      <div className="cost-assumptions">
        <div className="cost-ass-head">Assumptions <span className="subtle">(edit to re-estimate)</span></div>
        <div className="cost-inputs">
          {num(a.rate, 20, 500, 5, (n) => setA({ ...a, rate: n }), "Hourly rate ($)", "cost-rate")}
          {num(a.team, 1, 50, 1, (n) => setA({ ...a, team: n }), "Team size (FTE)", "cost-team")}
          {num(a.hoursPerMonth, 80, 200, 10, (n) => setA({ ...a, hoursPerMonth: n }), "Hours / person / month", "cost-hpm")}
          {num(Math.round(a.testFactor * 100), 0, 100, 5, (n) => setA({ ...a, testFactor: n / 100 }), "Test effort (% of dev)", "cost-test")}
          {num(Math.round(a.contingency * 100), 0, 100, 5, (n) => setA({ ...a, contingency: n / 100 }), "Contingency (%)", "cost-cont")}
        </div>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setA(DEFAULT_ASSUMPTIONS)}
          disabled={a.rate === DEFAULT_ASSUMPTIONS.rate && a.team === DEFAULT_ASSUMPTIONS.team && a.hoursPerMonth === DEFAULT_ASSUMPTIONS.hoursPerMonth && a.testFactor === DEFAULT_ASSUMPTIONS.testFactor && a.contingency === DEFAULT_ASSUMPTIONS.contingency}
        >
          Reset to defaults
        </button>
      </div>

      <div className="cost-section">
        <h4>By migration strategy</h4>
        <ul className="cost-bar-list">
          {est.perStrategy.length === 0 && <li className="subtle">No programs in this plan yet.</li>}
          {est.perStrategy.map((s) => (
            <li key={s.strategy}>
              <span className="label">{s.strategy}</span>
              <span className="bar"><span style={{ width: `${(s.cost / maxStrategyCost) * 100}%` }} /></span>
              <span className="meta subtle">{s.programs} prog · {formatHours(s.hours)}</span>
              <span className="cost">{formatMoney(s.cost)}</span>
            </li>
          ))}
        </ul>
      </div>

      {est.perWave.length > 0 && (
        <div className="cost-section">
          <h4>By wave</h4>
          <div className="table-wrap">
            <table className="data cost-wave-table">
              <thead>
                <tr>
                  <th>Wave</th>
                  <th>Programs</th>
                  <th className="num">Dev</th>
                  <th className="num">Test</th>
                  <th className="num">Overhead</th>
                  <th className="num">Hours</th>
                  <th className="num">Cost</th>
                </tr>
              </thead>
              <tbody>
                {est.perWave.map((w) => (
                  <tr key={w.wave}>
                    <td><b>{w.wave}.</b> {w.name}</td>
                    <td className="subtle">{w.programs.length}</td>
                    <td className="num">{formatHours(w.dev_hours)}</td>
                    <td className="num">{formatHours(w.test_hours)}</td>
                    <td className="num">{formatHours(w.overhead_hours)}</td>
                    <td className="num"><b>{formatHours(w.total_hours)}</b></td>
                    <td className="num"><b>{formatMoney(w.cost)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <button type="button" className="cost-toggle" onClick={() => setShowDetails((s) => !s)} aria-expanded={showDetails}>
        {showDetails ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
        Per-program estimates ({est.perProgram.length})
      </button>
      {showDetails && (
        <div className="table-wrap">
          <table className="data cost-prog-table">
            <thead>
              <tr>
                <th>Program</th>
                <th>Strategy</th>
                <th>Risk</th>
                <th className="num">Hours</th>
                <th className="num">Cost</th>
              </tr>
            </thead>
            <tbody>
              {est.perProgram.map((p) => (
                <tr key={p.program}>
                  <td className="mono" style={{ fontSize: 13 }}>{p.program}</td>
                  <td>{p.strategy}</td>
                  <td>{p.risk}</td>
                  <td className="num">{formatHours(p.hours)}</td>
                  <td className="num">{formatMoney(p.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="cost-footnote subtle">
        Rough estimate for planning only. Labor = (dev + test + wave overhead) × rate. Infrastructure = monthly cloud baseline × duration.
        Contingency is added on the subtotal. Risk multiplies effort (High ×1.4, Medium ×1.15). Actual results depend on team experience, data volumes and parallelism.
      </p>
    </div>
  );
}
