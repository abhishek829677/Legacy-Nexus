import { useCallback, useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";
import { LuChevronLeft, LuChevronRight, LuPause, LuPlay } from "react-icons/lu";

/** True when the user asked the OS for less motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Fades and lifts its content in the first time it scrolls into view.
 * Content is always rendered (and visible without JavaScript or with reduced motion).
 */
export function Reveal({ children, as: Tag = "div", delay = 0, className = "", style }: {
  children: ReactNode; as?: ElementType; delay?: number; className?: string; style?: CSSProperties;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(() => prefersReducedMotion() || typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (shown || !ref.current) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setShown(true);
        io.disconnect();
      }
    }, { rootMargin: "0px 0px -8% 0px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [shown]);
  return (
    <Tag ref={ref} className={`mx-reveal ${shown ? "is-in" : ""} ${className}`} style={{ ...style, transitionDelay: shown ? `${delay}ms` : undefined }}>
      {children}
    </Tag>
  );
}

/**
 * Counts up to a number when it first appears (and eases between values when it changes).
 * Screen readers and reduced-motion users always get the final value; missing values show "—".
 */
export function CountUp({ value, duration = 900, format = (n: number) => new Intl.NumberFormat().format(n) }: {
  value: number | null | undefined; duration?: number; format?: (n: number) => string;
}) {
  const target = typeof value === "number" && Number.isFinite(value) ? value : null;
  const [shown, setShown] = useState(() => (target === null || prefersReducedMotion() ? target : 0));
  const from = useRef(shown ?? 0);
  useEffect(() => {
    if (target === null) { setShown(null); return; }
    if (prefersReducedMotion()) { setShown(target); return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = a + (target - a) * eased;
      setShown(Number.isInteger(target) ? Math.round(v) : v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  if (target === null) return <>—</>;
  return (
    <>
      <span aria-hidden="true">{format(shown ?? target)}</span>
      <span className="mx-sr">{format(target)}</span>
    </>
  );
}

/**
 * Cursor spotlight for any element with the class "mx-spot": a soft glow that follows the pointer.
 * One delegated listener for the whole app; it only writes two CSS variables.
 */
export function installSpotlight() {
  if (typeof window === "undefined" || (window as unknown as { __mxSpot?: boolean }).__mxSpot) return;
  (window as unknown as { __mxSpot?: boolean }).__mxSpot = true;
  document.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const el = (e.target as Element | null)?.closest?.(".mx-spot") as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx-x", `${e.clientX - r.left}px`);
    el.style.setProperty("--mx-y", `${e.clientY - r.top}px`);
  }, { passive: true });
}

export type Slide = { key: string; label: string; content: ReactNode };

/**
 * Accessible carousel: auto-advances, pauses on hover, focus or the pause button,
 * and never auto-advances when reduced motion is requested.
 */
export function Slider({ slides, label, interval = 6500, tone = "light", className = "" }: {
  slides: Slide[]; label: string; interval?: number; tone?: "light" | "dark"; className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(prefersReducedMotion);
  const [hover, setHover] = useState(false);
  const n = slides.length;
  const go = useCallback((i: number) => setIndex(((i % n) + n) % n), [n]);

  useEffect(() => {
    if (paused || hover || n < 2) return;
    const t = window.setTimeout(() => go(index + 1), interval);
    return () => window.clearTimeout(t);
  }, [index, paused, hover, interval, go, n]);

  return (
    <div
      className={`mx-slider mx-slider-${tone} ${className}`}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setHover(true)}
      onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover(false); }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") { go(index + 1); e.preventDefault(); }
        if (e.key === "ArrowLeft") { go(index - 1); e.preventDefault(); }
      }}
    >
      <div className="mx-slides" aria-live={paused || hover ? "polite" : "off"}>
        {slides.map((s, i) => (
          <div
            key={s.key}
            className={`mx-slide ${i === index ? "on" : ""}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${n}: ${s.label}`}
            aria-hidden={i !== index}
            inert={i !== index ? true : undefined}
          >
            {s.content}
          </div>
        ))}
      </div>
      {n > 1 && (
        <div className="mx-slider-nav">
          <button type="button" className="mx-icon-btn" onClick={() => go(index - 1)} aria-label="Previous slide"><LuChevronLeft size={16} /></button>
          <div className="mx-dots">
            {slides.map((s, i) => (
              <button
                key={s.key}
                type="button"
                className={`mx-dot ${i === index ? "on" : ""}`}
                aria-label={`Show slide ${i + 1}: ${s.label}`}
                aria-current={i === index}
                onClick={() => go(i)}
              >
                {i === index && !paused && !hover && <span className="mx-dot-fill" style={{ animationDuration: `${interval}ms` }} key={index} />}
              </button>
            ))}
          </div>
          <button type="button" className="mx-icon-btn" onClick={() => go(index + 1)} aria-label="Next slide"><LuChevronRight size={16} /></button>
          <button type="button" className="mx-icon-btn" onClick={() => setPaused((p) => !p)} aria-label={paused ? "Play slides" : "Pause slides"}>
            {paused ? <LuPlay size={14} /> : <LuPause size={14} />}
          </button>
        </div>
      )}
    </div>
  );
}
