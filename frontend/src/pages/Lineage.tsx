import { useMemo, useState } from "react";
import { LuInfo } from "react-icons/lu";
import { AppShell } from "../components/AppShell";
import { GraphCanvas } from "../components/GraphCanvas";
import { BadgeLegend, TypeBadge } from "../components/GraphLegend";
import { PageGuide } from "../components/PageGuide";
import { useProject } from "../components/ProjectContext";
import { SymbolSearch } from "../components/SymbolSearch";
import { EmptyState, ErrorBox, Loading } from "../components/ui";
import { qs } from "../lib/api";
import { GUIDES, LINEAGE_LANGUAGES_NOTE } from "../lib/guides";
import { useApi } from "../lib/hooks";
import { BADGE_MEANING, badgeFor } from "../lib/nodeBadge";
import { Link } from "../lib/router";
import type { GraphEdge, GraphNode, SymbolHit } from "../lib/types";

type LineageResponse = { root: string; nodes: (GraphNode & { level: number; program?: string })[]; edges: GraphEdge[] };

/** Where an element sits relative to the one you picked, in words. */
function position(level: number) {
  if (level === 0) return "Selected";
  const n = Math.abs(level);
  return level < 0 ? `Comes from · ${n} ${n === 1 ? "step" : "steps"} back` : `Goes to · ${n} ${n === 1 ? "step" : "steps"} on`;
}

export function LineagePage() {
  const { project, openSource } = useProject();
  const pid = project!.id;
  const [search, setSearch] = useState("");
  const [node, setNode] = useState<string | null>(null);
  const [direction, setDirection] = useState<"both" | "down" | "up">("both");
  const [depth, setDepth] = useState(4);
  const { data: allExamples } = useApi<SymbolHit[]>(`/projects/${pid}/lineage/examples`);
  const examples = allExamples?.filter((h) => h.type === "column");
  const noFieldLineage = !!allExamples && (examples?.length ?? 0) === 0;
  const { data, error, loading } = useApi<LineageResponse>(node ? `/projects/${pid}/lineage${qs({ node, direction, depth })}` : null);

  const rootAccent = useMemo(() => (data ? { [data.root]: "#e9a23b" } : {}), [data]);
  const graph = useMemo(() => {
    if (!data) return null;
    return {
      nodes: data.nodes.map((n) => ({ ...n, label: n.type === "field" ? `${n.program}.${n.label}` : n.label })),
      edges: data.edges.map((e) => ({ ...e, how: (e as GraphEdge & { how?: string }).how ?? e.type.toLowerCase() })),
    };
  }, [data]);

  return (
    <AppShell title="Data lineage">
      <div className="page-head">
        <div>
          <h1>Data lineage</h1>
          <p>See where a value comes from and everywhere it goes.</p>
        </div>
      </div>
      <PageGuide id="lineage" guide={GUIDES.lineage} />
      {noFieldLineage && (
        <div className="info-box row" style={{ marginBottom: 16, alignItems: "flex-start" }}>
          <LuInfo size={16} style={{ flex: "none", marginTop: 2 }} aria-hidden="true" />
          <span>{LINEAGE_LANGUAGES_NOTE} <Link to={`/projects/${pid}/graph`}>Open the Dependency map</Link></span>
        </div>
      )}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row-wrap">
          <div style={{ flex: "1 1 280px", display: "flex" }}>
            <SymbolSearch projectId={pid} types="column,field,dataset" placeholder="Column or field, e.g. INTEREST_RATE, LK-CUST-ADDRESS"
              value={search} onChange={setSearch} onPick={(h) => { setSearch(h.name); setNode(h.id); }} autoFocus />
          </div>
          <select className="select" style={{ width: 240 }} value={direction} onChange={(e) => setDirection(e.target.value as "both")} aria-label="What to show">
            <option value="both">Where it comes from and goes</option>
            <option value="down">Only where it goes</option>
            <option value="up">Only where it comes from</option>
          </select>
          <select className="select" style={{ width: 130 }} value={depth} onChange={(e) => setDepth(Number(e.target.value))} aria-label="How many steps to follow">
            {[2, 3, 4, 6, 8].map((d) => <option key={d} value={d}>{d} steps</option>)}
          </select>
        </div>
        {(examples?.length ?? 0) > 0 && (
          <div className="row-wrap" style={{ marginTop: 10 }}>
            <span className="subtle">Try:</span>
            {examples!.map((h) => (
              <button key={h.id} className="chip" onClick={() => { setNode(h.id); setSearch(h.name); }}>{h.name.split(".").pop()}</button>
            ))}
          </div>
        )}
      </div>
      {error && <ErrorBox message={error} />}
      {!node && <div className="card"><EmptyState title="Pick a column or field">Lineage shows where the value comes from and everywhere it goes.</EmptyState></div>}
      {node && loading && !data && <Loading label="Tracing lineage" />}
      {graph && data && (
        <div className="grid-2" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)" }}>
          <div className="card" style={{ overflow: "hidden" }}>
            <div className="card-head">
              <div>
                <h3>Flow of the value</h3>
                <div className="subtle" style={{ marginTop: 2 }}>Left: where it comes from. Right: where it goes. The selected element has an orange ring.</div>
              </div>
            </div>
            <div className="graph-stage" style={{ height: 560 }}>
              <GraphCanvas graph={graph} nodeAccent={rootAccent} showEdgeLabels={false} dense ariaLabel="Data lineage" />
              <div className="graph-legend" role="note" aria-label="Legend">
                <span><i className="lg-line" style={{ borderTopColor: "#9aa8ba" }} /> value moves</span>
                <span><i className="lg-line" style={{ borderTopColor: "#c9821b", borderTopStyle: "dashed" }} /> used in a decision</span>
                <BadgeLegend graph={graph} />
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Elements ({data.nodes.length})</h3><span className="subtle">Click a row to open its code</span></div>
            <div className="table-wrap" style={{ maxHeight: 560 }}>
              <table className="data">
                <tbody>
                  {[...data.nodes].sort((a, b) => a.level - b.level).map((n) => {
                    const b = badgeFor(n.type, n.language);
                    return (
                      <tr key={n.id} className={n.file ? "clickable" : ""} onClick={() => n.file && openSource(n.file as string, (n.line as number) || 1)}>
                        <td><TypeBadge badge={b} type={n.type} /></td>
                        <td>
                          <div className="mono" style={{ fontSize: 12.5 }}>{n.type === "field" ? `${n.program}.${n.label}` : n.label}</div>
                          <div className="subtle" style={{ fontSize: 12 }}>{BADGE_MEANING[b] ?? n.type}</div>
                        </td>
                        <td className="subtle" style={{ whiteSpace: "nowrap" }}>{position(n.level)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
