import cytoscape, { type Core, type ElementDefinition, type NodeSingular } from "cytoscape";
import ELK from "elkjs/lib/elk.bundled.js";
import { forwardRef, useEffect, useImperativeHandle, useRef, type KeyboardEvent } from "react";
import { TYPE_COLORS } from "../lib/format";
import type { Graph } from "../lib/types";

const elk = new ELK();

export type GraphHandle = { fit: () => void; zoom: (factor: number) => void; png: () => string | null; focus: (id: string) => void };

type Props = {
  graph: Graph;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  direction?: "RIGHT" | "DOWN";
  nodeAccent?: Record<string, string>; // id -> css colour for a ring (severity, root)
  showEdgeLabels?: boolean;
  dense?: boolean;
  ariaLabel?: string;
};

const EDGE_LABEL: Record<string, string> = {
  EXECUTES: "runs", CALLS: "calls", READ_BY: "read by", WRITES: "writes", EXPOSED_AS: "exposed as",
  INCLUDED_IN: "included in", REFERENCES: "FK", HAS_COLUMN: "", DATA: "", CONTROL: "controls", PART_OF: "part of",
  UNRESOLVED_CALL: "calls at runtime", USES: "uses", MAPS_TO: "maps to", CONFIGURES: "connects to",
};

// Graph signal colours (kept in step with the legends on the graph pages).
const SELECT = "#e9a23b";
const SELECT_INK = "#7a4d0c";
const EDGE = "#9aa8ba";
const EDGE_HOVER = "#5f6f86";

function nodeSize(label: string, dense?: boolean) {
  const w = Math.min(260, Math.max(dense ? 76 : 100, label.length * (dense ? 6.8 : 7.8) + 30));
  return { width: w, height: dense ? 30 : 38 };
}

/** Read a design token so the canvas uses the same type and text colours as the page. */
function token(name: string, fallback: string) {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch {
    return fallback;
  }
}

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export const GraphCanvas = forwardRef<GraphHandle, Props>(function GraphCanvas(
  { graph, selected, onSelect, direction = "RIGHT", nodeAccent, showEdgeLabels = true, dense, ariaLabel = "Graph" },
  ref,
) {
  const el = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  const fit = () => {
    const cy = cyRef.current;
    if (!cy) return;
    if (reducedMotion()) cy.fit(cy.elements(), 60);
    else cy.animate({ fit: { eles: cy.elements(), padding: 60 }, duration: 250 });
  };
  const zoom = (f: number) => {
    const cy = cyRef.current;
    if (cy) cy.zoom({ level: cy.zoom() * f, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  };

  useImperativeHandle(ref, () => ({
    fit,
    zoom,
    png: () => cyRef.current?.png({ full: true, scale: 2, bg: "#ffffff" }) ?? null,
    focus: (id) => {
      const cy = cyRef.current;
      const n = cy?.getElementById(id);
      if (!cy || !n || n.empty()) return;
      const level = Math.max(cy.zoom(), 1);
      if (reducedMotion()) {
        cy.zoom(level);
        cy.center(n);
      } else {
        cy.animate({ center: { eles: n }, zoom: level, duration: 300 });
      }
    },
  }));

  useEffect(() => {
    if (!el.current) return;
    const container = el.current;
    let cancelled = false;
    const ids = new Set(graph.nodes.map((n) => n.id));
    const edges = graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target);
    const text = token("--text", "#18222f");
    const text3 = token("--text-3", "#7a8698");
    const sans = token("--font-sans", "IBM Plex Sans, system-ui, sans-serif");
    const mono = token("--font-mono", "IBM Plex Mono, monospace");

    const elements: ElementDefinition[] = [
      ...graph.nodes.map((n) => ({
        data: {
          id: n.id,
          label: n.label,
          type: n.type,
          color: TYPE_COLORS[n.type] ?? "#6f7c8e",
          accent: nodeAccent?.[n.id] ?? "",
          ...nodeSize(n.label, dense),
        },
      })),
      ...edges.map((e, i) => ({
        data: {
          id: `e${i}`,
          source: e.source,
          target: e.target,
          label: showEdgeLabels ? (e.how ?? EDGE_LABEL[e.type] ?? e.type.toLowerCase()) : "",
          kind: e.type,
        },
      })),
    ];

    const cy = cytoscape({
      container,
      elements,
      wheelSensitivity: 0.25,
      minZoom: 0.15,
      maxZoom: 3,
      style: [
        {
          selector: "node",
          style: {
            shape: "round-rectangle",
            width: "data(width)",
            height: "data(height)",
            "background-color": "#ffffff",
            "border-width": 1.5,
            "border-color": "data(color)",
            label: "data(label)",
            "font-family": sans,
            "font-size": dense ? 11 : 12.5,
            "font-weight": 500,
            color: text,
            "text-valign": "center",
            "text-halign": "center",
            "text-wrap": "ellipsis",
            "text-max-width": (n: NodeSingular) => `${Math.max(40, Number(n.data("width")) - 16)}px`,
            "overlay-opacity": 0,
          },
        },
        { selector: "node[type = 'job']", style: { "background-color": "#ece9fa" } },
        { selector: "node[type = 'table'], node[type = 'column']", style: { "background-color": "#e2f2f0", shape: "barrel" } },
        { selector: "node[type = 'dataset']", style: { "background-color": "#fdf2df", shape: "tag" } },
        { selector: "node[type = 'api']", style: { "background-color": "#f8e6ef", shape: "hexagon" } },
        { selector: "node[type = 'external']", style: { "border-style": "dashed", "background-color": "#f3f5f8" } },
        { selector: "node[type = 'unresolved']", style: { "border-style": "dashed", "background-color": "#fff1e8", shape: "diamond" } },
        { selector: "node[type = 'config']", style: { "background-color": "#f1f5f9", shape: "cut-rectangle" } },
        { selector: "node[type = 'field']", style: { "background-color": "#f3f5f8", "font-family": mono, "font-size": 10.5 } },
        // Hover: a soft halo in the node's own type colour.
        { selector: "node.hover", style: { "border-width": 2.5, "underlay-color": "data(color)", "underlay-opacity": 0.14, "underlay-padding": 4 } },
        // Neighbours of the selection keep full strength and a slightly firmer outline.
        { selector: "node.nb", style: { "border-width": 2 } },
        // Accent rings (impact severity, change root, story steps): ring plus a faint halo so they read at any zoom.
        { selector: "node[accent != '']", style: { "border-width": 3.5, "border-color": "data(accent)", "underlay-color": "data(accent)", "underlay-opacity": 0.16, "underlay-padding": 5 } },
        { selector: "node:selected", style: { "border-width": 3.5, "border-color": SELECT, "underlay-color": SELECT, "underlay-opacity": 0.28, "underlay-padding": 7, "font-weight": 600, "z-index": 10 } },
        { selector: "node.faded", style: { opacity: 0.22 } },
        {
          selector: "edge",
          style: {
            width: 1.4,
            "line-color": EDGE,
            "target-arrow-color": EDGE,
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.85,
            "curve-style": "bezier",
            label: "data(label)",
            "font-family": sans,
            "font-size": 9.5,
            color: text3,
            "text-background-color": "#ffffff",
            "text-background-opacity": 0.92,
            "text-background-padding": "2px",
            "text-background-shape": "roundrectangle",
            "text-rotation": "autorotate",
            // Hide edge labels once they are too small to read; they return as you zoom in.
            "min-zoomed-font-size": 7,
            "overlay-opacity": 0,
          },
        },
        { selector: "edge[kind = 'CONTROL']", style: { "line-style": "dashed", "line-color": "#c9821b", "target-arrow-color": "#c9821b" } },
        { selector: "edge[kind = 'WRITES']", style: { "line-color": "#15807a", "target-arrow-color": "#15807a" } },
        { selector: "edge[kind = 'UNRESOLVED_CALL']", style: { "line-style": "dashed", "line-color": "#c2410c", "target-arrow-color": "#c2410c" } },
        { selector: "edge[kind = 'USES'], edge[kind = 'MAPS_TO'], edge[kind = 'CONFIGURES']", style: { "line-style": "dotted" } },
        { selector: "edge[kind = 'HAS_COLUMN']", style: { "line-style": "dotted", "target-arrow-shape": "none" } },
        { selector: "edge.hover-edge", style: { width: 2.2, "line-color": EDGE_HOVER, "target-arrow-color": EDGE_HOVER, color: text, "z-index": 4 } },
        { selector: "edge.faded", style: { opacity: 0.1 } },
        {
          selector: "edge.hl",
          style: { width: 2.6, "line-color": SELECT, "target-arrow-color": SELECT, color: SELECT_INK, "font-weight": 600, "min-zoomed-font-size": 5, "z-index": 5 },
        },
      ],
      layout: { name: "preset" },
    });
    cyRef.current = cy;

    cy.on("tap", "node", (evt) => selectRef.current?.(evt.target.id()));
    cy.on("tap", (evt) => {
      if (evt.target === cy) selectRef.current?.(null);
    });
    cy.on("mouseover", "node", (evt) => {
      const n = evt.target as NodeSingular;
      cy.batch(() => {
        n.addClass("hover");
        n.connectedEdges().not(".hl").addClass("hover-edge");
      });
      container.style.cursor = "pointer";
      container.title = n.data("label"); // full name when the box truncates it
    });
    cy.on("mouseout", "node", (evt) => {
      const n = evt.target as NodeSingular;
      cy.batch(() => {
        n.removeClass("hover");
        n.connectedEdges().removeClass("hover-edge");
      });
      container.style.cursor = "";
      container.title = "";
    });

    // Keep Cytoscape's hit-testing in step when the stage changes size (details panel, toolbar wrap, rotation).
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => cy.resize()) : null;
    ro?.observe(container);

    elk
      .layout({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": direction,
          "elk.layered.spacing.nodeNodeBetweenLayers": dense ? "50" : "64",
          "elk.spacing.nodeNode": dense ? "16" : "22",
          "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
          "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
          "elk.separateConnectedComponents": "true",
          "elk.spacing.componentComponent": "50",
        },
        children: graph.nodes.map((n) => ({ id: n.id, ...nodeSize(n.label, dense) })),
        edges: edges.map((e, i) => ({ id: `e${i}`, sources: [e.source], targets: [e.target] })),
      })
      .then((res) => {
        if (cancelled) return;
        cy.batch(() => {
          res.children?.forEach((c) => {
            cy.getElementById(c.id).position({ x: (c.x ?? 0) + (c.width ?? 0) / 2, y: (c.y ?? 0) + (c.height ?? 0) / 2 });
          });
        });
        cy.fit(undefined, 50);
        if (cy.zoom() > 1.3) cy.zoom(1.3);
        const anchor = cy.nodes("[accent != '']").first();
        const minZoom = dense ? 0.95 : 0.62;
        if (cy.zoom() < minZoom) {
          // Too dense to read when fitted: keep labels legible and start from the selected element.
          cy.zoom(minZoom);
          const target = anchor.nonempty() ? anchor : cy.nodes().first();
          const pos = target.renderedPosition();
          cy.panBy({ x: 40 + target.renderedWidth() / 2 - pos.x, y: cy.height() / 2 - pos.y });
        } else {
          cy.center();
        }
      })
      .catch(() => cy.layout({ name: "breadthfirst", directed: true, padding: 40 }).run());

    return () => {
      cancelled = true;
      ro?.disconnect();
      container.style.cursor = "";
      container.title = "";
      cy.destroy();
      cyRef.current = null;
    };
  }, [graph, direction, nodeAccent, showEdgeLabels, dense]);

  // Selection highlight without relayout (re-applied whenever the canvas is rebuilt).
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass("faded hl nb");
      cy.nodes().unselect();
      if (!selected) return;
      const n = cy.getElementById(selected);
      if (n.empty()) return;
      n.select();
      const hood = n.closedNeighborhood();
      cy.elements().not(hood).addClass("faded");
      hood.nodes().not(n).addClass("nb");
      n.connectedEdges().removeClass("hover-edge").addClass("hl");
    });
  }, [selected, graph, direction, nodeAccent, showEdgeLabels, dense]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "Escape" && selected) selectRef.current?.(null);
    else if (e.key === "+" || e.key === "=") zoom(1.25);
    else if (e.key === "-" || e.key === "_") zoom(0.8);
    else if (e.key === "0") fit();
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={el}
      className="graph-canvas"
      tabIndex={0}
      role="region"
      aria-label={`${ariaLabel}. Drag to pan, scroll or pinch to zoom. Keys: plus and minus zoom, 0 fits, Escape clears the selection.`}
      aria-keyshortcuts="+ - 0 Escape"
      onKeyDown={onKeyDown}
    />
  );
});
