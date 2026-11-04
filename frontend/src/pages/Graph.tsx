import { useMemo, useRef, useState, type ReactNode } from "react";
import { LuCode, LuImage, LuLayers, LuMaximize, LuX, LuZoomIn, LuZoomOut } from "react-icons/lu";
import { AppShell } from "../components/AppShell";
import { BusinessMap } from "../components/BusinessMap";
import { GraphCanvas, type GraphHandle } from "../components/GraphCanvas";
import { BlastRadiusCard, GraphHud } from "../components/GraphInsights";
import { BadgeLegend, TypeBadge } from "../components/GraphLegend";
import { BADGE_MEANING, badgeFor } from "../lib/nodeBadge";
import { GUIDES } from "../lib/guides";
import { GuideButton } from "../components/PageGuide";
import { useProject } from "../components/ProjectContext";
import { SymbolSearch } from "../components/SymbolSearch";
import { usePageTour } from "../components/Tour";
import { GRAPH_TOUR } from "../components/tours";
import { ErrorBox, Loading, TypeDot } from "../components/ui";
import { qs } from "../lib/api";
import { TYPE_LABELS, criticalityTag } from "../lib/format";
import { useApi } from "../lib/hooks";
import { navigate } from "../lib/router";
import type { BlastRadius, Graph, GraphEdge, GraphNode, ProgramStats, Rule } from "../lib/types";

const ALL_TYPES = ["job", "program", "table", "dataset", "api", "procedure", "external", "copybook", "unresolved", "config"];

type NodeDetail = {
  node: GraphNode;
  incoming: GraphEdge[];
  outgoing: GraphEdge[];
  stats?: ProgramStats;
  paragraphs?: { name: string; start_line: number; end_line: number }[];
  parameters?: string[];
  rules?: Rule[];
  definition?: { name: string; type: string; primary_key: boolean; nullable: boolean; line: number }[];
  blast_radius?: BlastRadius;
};

const VIEW_KEY = "lnx.graph.view";

export function GraphPage() {
  const { project } = useProject();
  const pid = project!.id;
  const [view, setView] = useState<"business" | "technical">(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "technical" ? "technical" : "business";
    } catch {
      return "business";
    }
  });
  const choose = (v: "business" | "technical") => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage unavailable */ }
  };
  const switcher = (
    <div className="seg" role="tablist" aria-label="Map view" data-tour="map-switch">
      <button role="tab" aria-selected={view === "business"} aria-label="Business view (files)" title="Business view (files)" className={view === "business" ? "on" : ""} onClick={() => choose("business")}><LuLayers size={14} /> <span className="seg-label">Business<span className="hide-sm"> view (files)</span></span></button>
      <button role="tab" aria-selected={view === "technical"} aria-label="Technical view" title="Technical view" className={view === "technical" ? "on" : ""} onClick={() => choose("technical")}><LuCode size={14} /> <span className="seg-label">Technical<span className="hide-sm"> view</span></span></button>
    </div>
  );
  if (view === "business") {
    return <AppShell title="Dependency map" wide actions={switcher}><BusinessMap projectId={pid} /></AppShell>;
  }
  return <TechnicalGraph pid={pid} switcher={switcher} />;
}

function TechnicalGraph({ pid, switcher }: { pid: number; switcher: ReactNode }) {
  const [types, setTypes] = useState<string[]>(["job", "program", "table", "dataset", "api", "procedure", "external", "unresolved"]);
  const [columns, setColumns] = useState(false);
  const [fks, setFks] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [depth, setDepth] = useState(2);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [labels, setLabels] = useState(true);
  const canvas = useRef<GraphHandle>(null);
  usePageTour("graph", GRAPH_TOUR);

  const path = `/projects/${pid}/graph${qs({ types: types.join(","), include_columns: columns, include_fk: fks, focus: focus ?? undefined, depth: focus ? depth : undefined })}`;
  const { data, error, loading } = useApi<Graph>(path);
  const graph = useMemo(() => data ?? { nodes: [], edges: [] }, [data]);

  const toggle = (t: string) => setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  const exportPng = () => {
    const uri = canvas.current?.png();
    if (!uri) return;
    const a = document.createElement("a");
    a.href = uri;
    a.download = `dependency-graph-${pid}.png`;
    a.click();
  };

  return (
    <AppShell title="Dependency map" wide actions={switcher}>
      <div className={`graph-page ${selected ? "" : "no-panel"}`}>
        <div className="graph-stage has-toolbar has-hud" data-tour="graph-canvas">
          <div className="graph-toolbar">
            <div className="panel panel-filters" role="group" aria-label="Show element types" data-tour="graph-filters">
              {ALL_TYPES.map((t) => (
                <button key={t} className={`chip ${types.includes(t) ? "on" : ""}`} aria-pressed={types.includes(t)} onClick={() => toggle(t)}>
                  <TypeDot type={t} /> {TYPE_LABELS[t]}
                </button>
              ))}
              <span className="tb-sep" aria-hidden="true" />
              <label className="check">
                <input type="checkbox" checked={columns} onChange={(e) => setColumns(e.target.checked)} /> Columns
              </label>
              <label className="check">
                <input type="checkbox" checked={fks} onChange={(e) => setFks(e.target.checked)} /> Foreign keys
              </label>
            </div>
            <div className="panel panel-search" data-tour="graph-search">
              <SymbolSearch projectId={pid} types="program,table,job,dataset,api,procedure,copybook,external,column" placeholder="Focus on a program, table, job…"
                value={search} onChange={setSearch} onPick={(h) => {
                  if (h.type === "column") setColumns(true);
                  else if (!types.includes(h.type)) setTypes((cur) => [...cur, h.type]);
                  setFocus(h.id); setSearch(h.name); setSelected(h.id);
                }} />
              {focus && (
                <>
                  <select className="select" style={{ width: 92, height: 34 }} value={depth} onChange={(e) => setDepth(Number(e.target.value))} aria-label="Neighbourhood depth">
                    {[1, 2, 3, 4].map((d) => <option key={d} value={d}>{d} hop{d > 1 ? "s" : ""}</option>)}
                  </select>
                  <button className="btn btn-sm btn-ghost" onClick={() => { setFocus(null); setSearch(""); }}><LuX size={14} /> Clear</button>
                </>
              )}
            </div>
            <div className="spacer" />
            <div className="panel panel-tools" role="group" aria-label="View">
              <GuideButton guide={GUIDES.mapTechnical} />
              <span className="tb-sep" aria-hidden="true" />
              <label className="check"><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> Edge labels</label>
              <span className="tb-sep" aria-hidden="true" />
              <button className="btn btn-ghost btn-icon btn-sm" title="Zoom in" aria-label="Zoom in" onClick={() => canvas.current?.zoom(1.25)}><LuZoomIn size={16} /></button>
              <button className="btn btn-ghost btn-icon btn-sm" title="Zoom out" aria-label="Zoom out" onClick={() => canvas.current?.zoom(0.8)}><LuZoomOut size={16} /></button>
              <button className="btn btn-ghost btn-icon btn-sm" title="Fit to screen" aria-label="Fit to screen" onClick={() => canvas.current?.fit()}><LuMaximize size={16} /></button>
              <button className="btn btn-ghost btn-icon btn-sm" title="Export PNG" aria-label="Export PNG" onClick={exportPng}><LuImage size={16} /></button>
            </div>
          </div>
          {loading && !data && <div className="graph-overlay"><Loading label="Laying out graph" /></div>}
          {error && <div className="graph-error"><ErrorBox message={error} /></div>}
          {data && graph.nodes.length === 0 && <div className="graph-overlay muted">No elements match the selected filters.</div>}
          {graph.nodes.length > 0 && <GraphCanvas ref={canvas} graph={graph} selected={selected} onSelect={setSelected} showEdgeLabels={labels} dense={graph.nodes.length > 60} ariaLabel="Dependency graph" />}
          <EdgeLegend graph={graph} selected={!!selected} />
          {graph.nodes.length > 0 && <GraphHud graph={graph} />}
        </div>
        {selected && <NodePanel projectId={pid} id={selected} onClose={() => setSelected(null)} onFocus={(id) => { setFocus(id); setSelected(id); }} />}
      </div>
    </AppShell>
  );
}

/** Link styles drawn by GraphCanvas. The first two always show; the rest only when present on the canvas. */
const EDGE_STYLES: { label: string; color: string; line: "solid" | "dashed" | "dotted"; kinds?: string[] }[] = [
  { label: "writes", color: "#15807a", line: "solid" },
  { label: "calls / reads / runs", color: "#9aa8ba", line: "solid" },
  { label: "controls", color: "#c9821b", line: "dashed", kinds: ["CONTROL"] },
  { label: "decided at runtime", color: "#c2410c", line: "dashed", kinds: ["UNRESOLVED_CALL"] },
  { label: "uses / config / column", color: "#9aa8ba", line: "dotted", kinds: ["USES", "MAPS_TO", "CONFIGURES", "HAS_COLUMN"] },
];

function EdgeLegend({ graph, selected }: { graph: Graph; selected: boolean }) {
  const present = new Set(graph.edges.map((e) => e.type));
  const rows = EDGE_STYLES.filter((s) => !s.kinds || s.kinds.some((k) => present.has(k)));
  return (
    <div className="graph-legend" role="note" aria-label="Link legend">
      <span className="lg-title">Links</span>
      {rows.map((s) => (
        <span key={s.label}><i className="lg-line" style={{ borderTopColor: s.color, borderTopStyle: s.line }} /> {s.label}</span>
      ))}
      {selected && <span><i className="lg-line lg-hl" /> links of the selection</span>}
      <BadgeLegend graph={graph} />
    </div>
  );
}

function NodePanel({ projectId, id, onClose, onFocus }: { projectId: number; id: string; onClose: () => void; onFocus: (id: string) => void }) {
  const { openSource } = useProject();
  const { data, error } = useApi<NodeDetail>(id.startsWith("column:") || id.startsWith("field:") ? null : `/projects/${projectId}/graph/node${qs({ id })}`);
  const label = id.split(":").slice(1).join(":");
  const type = id.split(":")[0];

  const Rel = ({ e, dir }: { e: GraphEdge; dir: "in" | "out" }) => {
    const other = dir === "in" ? e.source : e.target;
    const name = other.split(":").slice(1).join(":");
    const ev = e.evidence?.[0];
    return (
      <div className="rel">
        <span className="t">{e.type.replace("_", " ").toLowerCase()}</span>
        <TypeDot type={other.split(":")[0]} />
        <button className="btn btn-ghost btn-sm rel-name" title={`Focus the graph on ${name}`} onClick={() => onFocus(other)}>{name}</button>
        <span className="spacer" />
        {ev && <button className="cite" onClick={() => openSource(ev.file, ev.line)}>{ev.file.split("/").pop()}:{ev.line}</button>}
      </div>
    );
  };

  return (
    <aside className="side-panel" aria-label="Element details">
      <div className="side-panel-head">
        <div className="row">
          {(() => {
            const b = badgeFor(type, data?.node.language);
            return <><TypeBadge badge={b} type={type} /><span className="subtle">{BADGE_MEANING[b] ?? TYPE_LABELS[type] ?? type}</span></>;
          })()}
          <div className="spacer" />
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close details" title="Close details"><LuX size={16} /></button>
        </div>
        <h2 className="mono">{label}</h2>
        {typeof data?.node.file === "string" && <div className="subtle mono" style={{ fontSize: 12, marginTop: 2, wordBreak: "break-all" }}>{data.node.file}</div>}
      </div>
      {data && (Boolean(data.node.hub) || Boolean(data.node.unused)) && (
        <div className="row-wrap" style={{ marginTop: 8 }}>
          {Boolean(data.node.hub) && <span className="tag tag-red">Critical hub: many parts depend on it</span>}
          {Boolean(data.node.unused) && <span className="tag tag-amber">Unused: nothing calls or runs it</span>}
        </div>
      )}
      {error && <ErrorBox message={error} />}
      {!data && !error && type !== "column" && <Loading />}
      {type === "column" && <p className="muted" style={{ marginTop: 10 }}>Open Data lineage to follow this column field by field.</p>}
      {data && (
        <div className="stack" style={{ marginTop: 12 }}>
          {typeof data.node.purpose === "string" && data.node.purpose && <p className="muted" style={{ fontSize: 14 }}>{data.node.purpose}</p>}
          {data.stats && (
            <div className="metric-tiles">
              <div className="metric-tile"><b>{data.stats.fan_in}</b><span>callers</span></div>
              <div className="metric-tile"><b>{data.stats.fan_out}</b><span>calls out</span></div>
              <div className="metric-tile"><b>{data.stats.business_rules}</b><span>rules</span></div>
            </div>
          )}
          {data.blast_radius && <BlastRadiusCard blast={data.blast_radius} onPick={onFocus} />}
          {data.stats && (
            <dl className="kv">
              <dt>Criticality</dt><dd><span className={`tag ${criticalityTag(data.stats.criticality)}`}>{data.stats.criticality}</span> <span className="subtle">score {data.stats.criticality_score}</span></dd>
              <dt>Type</dt><dd>{data.stats.type}</dd>
              <dt>Size</dt><dd>{data.stats.loc} LOC · complexity {data.stats.complexity}</dd>
              {data.parameters && data.parameters.length > 0 && <><dt>Parameters</dt><dd className="mono" style={{ fontSize: 12.5 }}>{data.parameters.join(", ")}</dd></>}
            </dl>
          )}
          <div className="row-wrap">
            {data.node.file && <button className="btn btn-sm" onClick={() => openSource(data.node.file as string, (data.node.line as number) || 1)}>View source</button>}
            {["program", "table", "copybook", "dataset"].includes(type) && (
              <button className="btn btn-sm btn-primary" onClick={() => navigate(`/projects/${projectId}/impact?target=${encodeURIComponent(id)}`)}>Analyse impact</button>
            )}
          </div>
          {data.incoming.length > 0 && <section><div className="mini-h">Incoming <span className="subtle">{data.incoming.length}</span></div><div className="rel-list">{data.incoming.map((e, i) => <Rel key={i} e={e} dir="in" />)}</div></section>}
          {data.outgoing.length > 0 && <section><div className="mini-h">Outgoing <span className="subtle">{data.outgoing.length}</span></div><div className="rel-list">{data.outgoing.map((e, i) => <Rel key={i} e={e} dir="out" />)}</div></section>}
          {data.definition && (
            <section>
              <div className="mini-h">Columns <span className="subtle">{data.definition.length}</span></div>
              <div className="rel-list">
                {data.definition.map((c) => (
                  <div key={c.name} className="rel"><span className="mono" style={{ fontSize: 12.5 }}>{c.name}</span><span className="spacer" /><span className="subtle">{c.type}{c.primary_key ? " · PK" : ""}</span></div>
                ))}
              </div>
            </section>
          )}
          {data.paragraphs && (
            <section>
              <div className="mini-h">Paragraphs <span className="subtle">{data.paragraphs.length}</span></div>
              <div className="rel-list">
                {data.paragraphs.map((p) => (
                  <button key={p.name} type="button" className="rel rel-btn" onClick={() => openSource(data.node.file as string, p.start_line, p.end_line)}>
                    <span className="mono" style={{ fontSize: 12.5 }}>{p.name}</span><span className="spacer" /><span className="subtle">{p.start_line}–{p.end_line}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {data.rules && data.rules.length > 0 && (
            <section>
              <div className="mini-h">Business rules <span className="subtle">{data.rules.length > 8 ? `8 of ${data.rules.length}` : data.rules.length}</span></div>
              <div className="rel-list">
                {data.rules.slice(0, 8).map((r) => (
                  <button key={r.id} type="button" className="rel rel-btn" style={{ alignItems: "flex-start" }} onClick={() => openSource(r.file, r.start_line, r.end_line)}>
                    <span className="mono" style={{ fontSize: 12 }}>{r.id}</span><span style={{ fontSize: 12.5 }}>{r.description}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
