import { useState } from "react";
import { LuCircleHelp, LuDownload, LuRefreshCw, LuRocket, LuTriangleAlert } from "react-icons/lu";
import { AppShell } from "../components/AppShell";
import { useProject } from "../components/ProjectContext";
import { usePageTour, useTour } from "../components/Tour";
import { ErrorBox, Loading, useToast } from "../components/ui";
import { api, download, qs } from "../lib/api";
import { criticalityTag, severityTag } from "../lib/format";
import "./modernize.css";
import { PAGE, TOUR, TOUR_KEY } from "./modernize.copy";
import { selectionsChanged } from "./modernize.format";
import { CardHead, StepSection } from "./ModernizeSection";
import { CostPanel } from "./CostPanel";
import { ReadinessPanel, type Readiness } from "./ReadinessPanel";

type Plan = {
  targets: { language: string; database: string; platform: string };
  readiness: Readiness;
  assessments: { program: string; file: string; type: string; loc: number; complexity: number; criticality: string; fan_in: number; business_rules: number; strategy: string; rationale: string; risk: string; target_component: string }[];
  services: { name: string; capability: string; technology: string; programs: string[]; owned_tables: string[]; endpoints: string[]; batch_jobs: string[]; hosting: string }[];
  architecture: { layers: { name: string; components: string[] }[]; mappings: { legacy: string; target: string }[] };
  waves: { wave: number; name: string; programs: string[]; tables?: string[]; activities: string[]; risk: string; rules_to_verify: number }[];
  ddl: { table: string; source: string; target: string; status: string; file: string }[];
  risks: { severity: string; title: string; detail: string }[];
  parity_summary: { scenarios: number; rules_covered: number };
  strategy_counts: Record<string, number>;
};

const OPTIONS = {
  language: [["java", "Java + Spring Boot"], ["dotnet", ".NET + ASP.NET Core"], ["python", "Python + FastAPI"]],
  database: [["postgresql", "PostgreSQL"], ["azure_sql", "Azure SQL"], ["oracle", "Oracle"], ["mysql", "MySQL"]],
  platform: [["azure", "Microsoft Azure"], ["aws", "AWS"], ["gcp", "Google Cloud"], ["on_prem", "On-prem Kubernetes"]],
} as const;

const STRATEGY_TAG: Record<string, string> = { Retire: "", Rehost: "tag-teal", Replatform: "tag-blue", Refactor: "tag-violet", Encapsulate: "tag-amber" };
const SEVERITY_ORDER = ["High", "Medium", "Low"];

export function ModernizePage() {
  const { project, openSource } = useProject();
  const pid = project!.id;
  const toast = useToast();
  const { replay } = useTour();
  const [targets, setTargets] = useState({ language: "java", database: "postgresql", platform: "azure" });
  const [plan, setPlan] = useState<Plan | null>(null);
  // The selections the shown plan was generated with, so a changed selection can be flagged.
  const [generatedWith, setGeneratedWith] = useState<typeof targets | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  usePageTour(TOUR_KEY, TOUR);

  const generate = async () => {
    const sent = targets;
    setBusy(true);
    setError(null);
    try {
      setPlan(await api.post<Plan>(`/projects/${pid}/modernization`, sent));
      setGeneratedWith(sent);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const dl = (format: string, name: string) =>
    download(`/projects/${pid}/modernization/parity${qs({ format })}`, name).catch((e) => toast(PAGE.toasts.downloadFailed(e.message), true));

  const stale = !!plan && selectionsChanged(generatedWith, targets);
  const ready = !!plan;
  const S = PAGE.steps;

  return (
    <AppShell title={PAGE.title}>
      <div className="mod-page">
        <div className="page-head">
          <div>
            <h1>{PAGE.heading}</h1>
            <p>{PAGE.intro}</p>
          </div>
          <button type="button" className="btn btn-sm" onClick={replay} data-tour="mod-help">
            <LuCircleHelp size={15} aria-hidden="true" /> {PAGE.helpButton}
          </button>
        </div>

        {/* 1. Choose target stack */}
        <StepSection step={S.targets} topic={PAGE.targets.topic} tour="mod-step-targets">
          <div className="card card-pad">
            <div className="row-wrap" style={{ alignItems: "flex-end", gap: 16 }}>
              <div className="row-wrap" data-tour="mod-targets" style={{ gap: 16 }}>
                {(Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]).map((k) => (
                  <div className="field mod-field" key={k}>
                    <label htmlFor={k}>{PAGE.targets.fields[k]}</label>
                    <select id={k} className="select" value={targets[k]} onChange={(e) => setTargets({ ...targets, [k]: e.target.value })}>
                      {OPTIONS[k].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" onClick={generate} disabled={busy} data-tour="mod-generate">
                {busy ? <span className="spinner" /> : <LuRocket size={16} aria-hidden="true" />} {PAGE.targets.generate}
              </button>
            </div>
          </div>
        </StepSection>

        <div aria-live="polite">
          {error && <div className="mod-gap"><ErrorBox message={PAGE.error(error)} /></div>}
          {stale && plan && (
            <div className="info-box mod-banner mod-gap" role="status">
              <LuRefreshCw size={16} aria-hidden="true" />
              <div className="mod-banner-text">
                <b>{PAGE.stale.text}</b>
                <div>{PAGE.stale.current(plan.targets.language, plan.targets.database, plan.targets.platform)}</div>
              </div>
              <button type="button" className="btn btn-sm btn-primary" onClick={generate} disabled={busy}>{PAGE.stale.action}</button>
            </div>
          )}
          {!plan && busy && <Loading label={PAGE.loading} />}
          {!plan && !busy && !error && <div className="info-box mod-gap">{PAGE.empty}</div>}
        </div>

        {/* 2. Review the plan */}
        <StepSection step={S.review} topic={PAGE.review.topic} tour="mod-review" ready={ready}>
          {plan && (
            <>
              <dl className="mod-summary" aria-label={PAGE.summary.label}>
                <div><dt>{PAGE.summary.language}</dt><dd>{plan.targets.language}</dd></div>
                <div><dt>{PAGE.summary.database}</dt><dd>{plan.targets.database}</dd></div>
                <div><dt>{PAGE.summary.platform}</dt><dd>{plan.targets.platform}</dd></div>
                <div><dt>{PAGE.summary.programs}</dt><dd>{plan.assessments.length}</dd></div>
              </dl>
              <div className="grid-2">
                <ReadinessPanel readiness={plan.readiness} targets={plan.targets} />
                <div className="card">
                  <CardHead title={PAGE.strategy.heading} topic={PAGE.strategy.topic} />
                  <div className="card-body">
                    <p className="muted" style={{ marginBottom: 12, fontSize: 14 }}>{PAGE.strategy.caption(plan.assessments.length)}</p>
                    <div className="row-wrap">
                      {Object.entries(plan.strategy_counts).map(([k, v]) => <span key={k} className={`tag ${STRATEGY_TAG[k]}`} style={{ height: 28, fontSize: 13 }}>{PAGE.strategy.tag(k, v)}</span>)}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </StepSection>

        {/* 3. Explore analysis & recommendations */}
        <StepSection step={S.explore} topic={PAGE.explore.topic} tour="mod-explore" ready={ready}>
          {plan && (
            <div className="stack" style={{ gap: 20 }}>
              <div className="grid-2">
                <div className="card">
                  <CardHead title={PAGE.architecture.heading} topic={PAGE.architecture.topic} />
                  <div className="card-body layers">
                    {plan.architecture.layers.map((l) => (
                      <div key={l.name} className={`layer ${l.name === "Services" ? "svc" : l.name === "Data" ? "data" : ""}`}>
                        <span className="name">{l.name}</span>
                        <div className="boxes">{l.components.map((c) => <span key={c} className="box">{c}</span>)}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="card">
                  <CardHead title={PAGE.mapping.heading} topic={PAGE.mapping.topic} />
                  <div className="table-wrap">
                    <table className="data">
                      <thead><tr><th>{PAGE.mapping.legacy}</th><th>{PAGE.mapping.target}</th></tr></thead>
                      <tbody>
                        {plan.architecture.mappings.map((m) => <tr key={m.legacy}><td className="subtle">{m.legacy}</td><td>{m.target}</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="card">
                <CardHead title={PAGE.services.heading} topic={PAGE.services.topic} caption={PAGE.services.caption(plan.services.length)} />
                {plan.services.length === 0 ? (
                  <div className="card-body muted">{PAGE.services.empty}</div>
                ) : (
                  <div className="table-wrap">
                    <table className="data">
                      <thead><tr><th>{PAGE.services.columns.service}</th><th>{PAGE.services.columns.replaces}</th><th>{PAGE.services.columns.owns}</th><th>{PAGE.services.columns.endpoints}</th></tr></thead>
                      <tbody>
                        {plan.services.map((s) => (
                          <tr key={s.name}>
                            <td><b className="mono" style={{ fontSize: 13 }}>{s.name}</b><div className="subtle">{s.capability} · {s.technology}</div></td>
                            <td className="mono" style={{ fontSize: 13 }}>{s.programs.join(", ")}</td>
                            <td className="mono" style={{ fontSize: 13 }}>{s.owned_tables.join(", ") || <span className="subtle">{PAGE.services.noTables}</span>}</td>
                            <td style={{ fontSize: 13 }}>{s.endpoints.length ? s.endpoints.map((e) => <div key={e} className="mono" style={{ fontSize: 12.5 }}>{e}</div>) : <span className="subtle">{PAGE.services.batchOnly(s.batch_jobs)}</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="card">
                <CardHead title={PAGE.assessment.heading} topic={PAGE.assessment.topic} caption={PAGE.assessment.caption} />
                {plan.assessments.length === 0 ? (
                  <div className="card-body muted">{PAGE.assessment.empty}</div>
                ) : (
                  <div className="table-wrap">
                    <table className="data">
                      <thead><tr>
                        <th>{PAGE.assessment.columns.program}</th><th>{PAGE.assessment.columns.criticality}</th><th className="num">{PAGE.assessment.columns.loc}</th>
                        <th className="num">{PAGE.assessment.columns.complexity}</th><th className="num">{PAGE.assessment.columns.rules}</th><th>{PAGE.assessment.columns.strategy}</th>
                        <th>{PAGE.assessment.columns.risk}</th><th>{PAGE.assessment.columns.target}</th>
                      </tr></thead>
                      <tbody>
                        {plan.assessments.map((a) => (
                          <tr key={a.program} className="clickable" onClick={() => openSource(a.file, 1)}>
                            <td>
                              <button type="button" className="cite mono" style={{ fontSize: 13, fontWeight: 600 }} aria-label={PAGE.assessment.openSource(a.program)}
                                onClick={(e) => { e.stopPropagation(); openSource(a.file, 1); }}>{a.program}</button>
                              <div className="subtle">{a.type}</div>
                            </td>
                            <td><span className={`tag ${criticalityTag(a.criticality)}`}>{a.criticality}</span></td>
                            <td className="num">{a.loc}</td><td className="num">{a.complexity}</td><td className="num">{a.business_rules}</td>
                            <td><span className={`tag ${STRATEGY_TAG[a.strategy]}`}>{a.strategy}</span><div className="subtle" style={{ maxWidth: 260, marginTop: 4 }}>{a.rationale}</div></td>
                            <td><span className={`tag ${severityTag(a.risk)}`}>{a.risk}</span></td>
                            <td style={{ fontSize: 13 }}>{a.target_component}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="card">
                <CardHead
                  title={PAGE.schema.heading}
                  topic={PAGE.schema.topic}
                  caption={plan.ddl.length > 0 ? PAGE.schema.caption(plan.ddl.filter((d) => d.status === "converted").length, plan.ddl.length) : undefined}
                />
                <div className="card-body stack">
                  {plan.ddl.length === 0 && <p className="muted">{PAGE.schema.empty}</p>}
                  {plan.ddl.map((d) => (
                    <div key={d.table}>
                      <div className="row" style={{ marginBottom: 6 }}><b className="mono">{d.table}</b><span className={`tag ${d.status === "converted" ? "tag-green" : "tag-amber"}`}>{PAGE.schema.status[d.status] ?? d.status}</span></div>
                      <div className="ddl-pair">
                        <div><div className="subtle mod-pane-label">{PAGE.schema.source}</div><pre>{d.source}</pre></div>
                        <div><div className="subtle mod-pane-label">{PAGE.schema.target(plan.targets.database)}</div><pre>{d.target}</pre></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <CardHead
                  title={PAGE.risks.heading}
                  topic={PAGE.risks.topic}
                  caption={plan.risks.length > 0 ? PAGE.risks.caption(SEVERITY_ORDER.map((s) => [s, plan.risks.filter((r) => r.severity === s).length] as [string, number]).filter(([, n]) => n > 0)) : undefined}
                />
                <div className="table-wrap">
                  <table className="data"><tbody>
                    {plan.risks.length === 0 && <tr><td className="subtle">{PAGE.risks.empty}</td></tr>}
                    {plan.risks.map((r, i) => (
                      <tr key={i}>
                        <td style={{ width: 100 }}><span className={`tag ${severityTag(r.severity)}`}>{r.severity === "High" && <LuTriangleAlert size={12} aria-hidden="true" />} {r.severity}</span></td>
                        <td><b>{r.title}</b><div className="subtle"><span className="mod-evidence">{PAGE.risks.evidence}</span> {r.detail}</div></td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
              </div>
            </div>
          )}
        </StepSection>

        {/* 4. Plan the migration */}
        <StepSection step={S.roadmap} topic={PAGE.waves.topic} tour="mod-roadmap" ready={ready}>
          {plan && (
            <div className="stack" style={{ gap: 20 }}>
              <div className="card">
                <CardHead title={PAGE.waves.heading} caption={plan.waves.length > 0 ? PAGE.waves.caption(plan.waves.length) : undefined} />
                <div className="card-body waves">
                  {plan.waves.length === 0 && <p className="muted">{PAGE.waves.empty}</p>}
                  {plan.waves.map((w) => (
                    <div className="wave" key={w.wave}>
                      <div className="rail"><span className="n">{w.wave}</span><span className="l" /></div>
                      <div className="body">
                        <div className="row-wrap"><b>{w.name}</b><span className={`tag ${severityTag(w.risk)}`}>{PAGE.waves.risk(w.risk)}</span>{w.rules_to_verify > 0 && <span className="tag">{PAGE.waves.rulesToVerify(w.rules_to_verify)}</span>}</div>
                        <div className="subtle mono" style={{ margin: "4px 0 6px" }}>{w.programs.join(", ")}{w.tables && w.tables.length ? ` · ${w.tables.join(", ")}` : ""}</div>
                        <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>{w.activities.map((a) => <li key={a}>{a}</li>)}</ul>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <CardHead title={PAGE.cost.heading} caption={PAGE.cost.caption} />
                <div className="card-body">
                  <CostPanel plan={{ assessments: plan.assessments, waves: plan.waves, services: plan.services, targets: plan.targets }} />
                </div>
              </div>
            </div>
          )}
        </StepSection>

        {/* 5. Verify results */}
        <StepSection step={S.verify} topic={PAGE.parity.topic} tour="mod-verify" ready={ready}>
          {plan && (
            <div className="card">
              <CardHead title={PAGE.parity.heading} />
              <div className="card-body">
                <p className="muted" style={{ fontSize: 14 }}>{PAGE.parity.caption(plan.parity_summary.scenarios, plan.parity_summary.rules_covered)}</p>
                <div className="row-wrap" style={{ marginTop: 12 }}>
                  <button className="btn btn-sm" onClick={() => dl("csv", "parity-tests.csv")}><LuDownload size={14} aria-hidden="true" /> {PAGE.parity.csv}</button>
                  <button className="btn btn-sm" onClick={() => dl("gherkin", "parity.feature")}><LuDownload size={14} aria-hidden="true" /> {PAGE.parity.gherkin}</button>
                </div>
              </div>
            </div>
          )}
        </StepSection>
      </div>
    </AppShell>
  );
}
