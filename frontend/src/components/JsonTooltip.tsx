import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Shows a short one-line JSON preview; on hover or keyboard focus, the whole value pretty-printed in a tooltip.
 *
 * The tooltip is rendered on document.body with fixed positioning so a scrolling table cannot clip it,
 * and it stays open while the pointer is over it, so long values can be scrolled and selected.
 */
export function JsonTooltip({ value, maxWidth, maxChars = 40 }: { value: unknown; maxWidth?: number; maxChars?: number }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; maxWidth?: number } | null>(null);

  // How many characters fit in the preview's column (it can be narrower than maxChars on small screens).
  const [fit, setFit] = useState(maxChars);
  useLayoutEffect(() => {
    const el = trigger.current;
    if (!el) return;
    const ctx = document.createElement("canvas").getContext("2d");
    const measure = () => {
      if (!el.clientWidth) return setFit(maxChars); // not laid out (hidden, or tests)
      const cs = getComputedStyle(el);
      let charW = 7.2;
      if (ctx) { ctx.font = `${cs.fontSize} ${cs.fontFamily}`; charW = ctx.measureText("0").width || charW; }
      setFit(Math.max(8, Math.min(maxChars, Math.floor(el.clientWidth / charW) - 3))); // 3 for the "..."
    };
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [maxChars]);

  const show = () => { window.clearTimeout(closeTimer.current); setOpen(true); };
  const hide = () => { window.clearTimeout(closeTimer.current); closeTimer.current = window.setTimeout(() => setOpen(false), 120); };
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // In the empty space to the right of the card holding the table, level with the row, when there is room;
  // otherwise below the preview (or above it near the bottom of the window).
  const place = () => {
    if (!trigger.current || !pop.current) return;
    const el = pop.current;
    const t = trigger.current.getBoundingClientRect();
    const box = (trigger.current.closest(".card") ?? trigger.current).getBoundingClientRect();
    const gap = 12, edge = 8, minSide = 220;
    const room = window.innerWidth - box.right - gap - edge;
    if (room >= minSide) {
      const maxWidth = Math.min(460, room);
      el.style.maxWidth = `${maxWidth}px`; // measure the height at the width it will have
      const p = el.getBoundingClientRect();
      const top = Math.min(Math.max(edge, t.top - 10), window.innerHeight - p.height - edge);
      setPos({ left: box.right + gap, top: Math.max(edge, top), maxWidth });
      return;
    }
    el.style.maxWidth = "";
    const p = el.getBoundingClientRect();
    const below = t.bottom + 6 + p.height <= window.innerHeight - edge;
    const top = below ? t.bottom + 6 : Math.max(edge, t.top - 6 - p.height);
    const left = Math.min(Math.max(edge, t.left), window.innerWidth - p.width - edge);
    setPos({ left, top });
  };
  useLayoutEffect(() => { if (open) place(); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // Follow the preview when the page or table scrolls; scrolling inside the tooltip itself is ignored.
    const onScroll = (e: Event) => { if (!pop.current?.contains(e.target as Node)) place(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  const oneLine = JSON.stringify(value) ?? "";
  return (
    <>
      <button ref={trigger} type="button" className="json-preview" style={maxWidth ? { maxWidth } : undefined}
        onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
        aria-label={`Details: ${oneLine}`} aria-expanded={open}>
        {shorten(oneLine, fit)}
      </button>
      {open && createPortal(
        <div ref={pop} className="json-pop" role="tooltip" onMouseEnter={show} onMouseLeave={hide}
          style={pos ? { left: pos.left, top: pos.top, maxWidth: pos.maxWidth } : { left: -9999, top: 0 }}>
          <pre>{highlight(value)}</pre>
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * Cuts a one-line JSON string to about `max` characters and adds "...". It breaks after the last whole
 * field that fits ({"files":245,"skipped":84,...) so a number is never shown half-cut as if it were a value;
 * only when the first field alone is too long does it cut inside it ({"file":"aws-mainframe-mod...).
 */
export function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const comma = head.lastIndexOf(",");
  if (comma > 0) return `${head.slice(0, comma + 1)}...`;
  return `${head.trimEnd()}...`;
}

/** Pretty-prints JSON with keys, strings, numbers, booleans and null in different colours. */
function highlight(value: unknown): ReactNode[] {
  const text = JSON.stringify(value, null, 2) ?? "";
  const out: ReactNode[] = [];
  const token = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let last = 0;
  for (const m of text.matchAll(token)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const [whole, str, colon, lit, num] = m;
    const k = out.length;
    if (str && colon) out.push(<span key={k} className="j-key">{str}</span>, colon);
    else if (str) out.push(<span key={k} className="j-str">{str}</span>);
    else if (lit) out.push(<span key={k} className={lit === "null" ? "j-null" : "j-bool"}>{lit}</span>);
    else if (num) out.push(<span key={k} className="j-num">{num}</span>);
    else out.push(whole);
    last = m.index! + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
