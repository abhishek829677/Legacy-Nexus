import { TYPE_COLORS } from "../lib/format";
import { BADGE_MEANING, badgeFor } from "../lib/nodeBadge";
import type { Graph } from "../lib/types";
import "./graph-legend.css";

/** The badge as it appears inside a graph box, for use in legends and side panels. */
export function TypeBadge({ badge, type }: { badge: string; type: string }) {
  const color = TYPE_COLORS[type] ?? "#6f7c8e";
  return (
    <span className="type-badge" style={{ color, borderColor: `${color}59`, background: `${color}1f` }} title={BADGE_MEANING[badge] ?? badge}>
      {badge}
    </span>
  );
}

/** Lists only the badges present on the canvas, each with its meaning in plain words. */
export function BadgeLegend({ graph, title = "Box types" }: { graph: Graph; title?: string }) {
  const seen = new Map<string, { type: string; count: number }>();
  for (const n of graph.nodes) {
    const b = typeof n.badge === "string" ? n.badge : badgeFor(n.type, n.language);
    const cur = seen.get(b);
    if (cur) cur.count += 1;
    else seen.set(b, { type: n.type, count: 1 });
  }
  if (!seen.size) return null;
  const rows = [...seen.entries()].sort((a, b) => b[1].count - a[1].count);
  return (
    <div className="badge-legend" role="note" aria-label={title}>
      <span className="lg-title">{title}</span>
      {rows.map(([b, { type, count }]) => (
        <span key={b} className="badge-legend-item">
          <TypeBadge badge={b} type={type} /> {BADGE_MEANING[b] ?? b} <span className="subtle">{count}</span>
        </span>
      ))}
    </div>
  );
}
