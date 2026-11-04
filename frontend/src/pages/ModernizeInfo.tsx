import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { LuInfo } from "react-icons/lu";
import { PAGE, TOPIC_SECTIONS, type Topic } from "./modernize.copy";

/**
 * ⓘ button with an explanation panel, used only on the Modernize page.
 * Opens on hover, keyboard focus, and click/tap (a click pins it open). Esc or a click outside closes it.
 */
export function InfoPopover({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [shift, setShift] = useState(0);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const skipFocusOpen = useRef(false);
  const id = useId();

  const show = useCallback(() => {
    // Keep the panel inside the visible content area (the main column clips overflow).
    const anchor = wrapRef.current?.getBoundingClientRect(); // the panel is positioned relative to this box
    const area = (wrapRef.current?.closest(".main") as HTMLElement | null)?.getBoundingClientRect();
    if (anchor) {
      const left = area ? area.left : 0;
      const right = area ? area.right : window.innerWidth;
      const width = Math.min(360, right - left - 32);
      const wanted = Math.min(Math.max(left + 16, anchor.left), right - 16 - width);
      setShift(wanted - anchor.left);
    }
    setOpen(true);
  }, []);
  const hide = useCallback(() => {
    setOpen(false);
    setPinned(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) hide();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      hide();
      skipFocusOpen.current = true;
      btnRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, hide]);

  return (
    <span
      ref={wrapRef}
      className="mod-info"
      onMouseEnter={show}
      onMouseLeave={() => !pinned && setOpen(false)}
      onBlur={(e) => {
        if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) hide();
      }}
    >
      <button
        ref={btnRef}
        type="button"
        className="mod-info-btn"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onFocus={() => {
          if (skipFocusOpen.current) skipFocusOpen.current = false;
          else show();
        }}
        onClick={() => {
          if (pinned) hide();
          else {
            show();
            setPinned(true);
          }
        }}
      >
        <LuInfo size={16} aria-hidden="true" />
      </button>
      {open && (
        <div id={id} className="mod-info-panel" role="dialog" aria-label={title} tabIndex={-1} style={{ left: shift }}>
          <div className="mod-info-title">{title}</div>
          {children}
        </div>
      )}
    </span>
  );
}

/** One labelled block inside the panel. */
export function InfoSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="mod-info-sec">
      <div className="mod-info-h">{heading}</div>
      <div>{children}</div>
    </div>
  );
}

/** ⓘ for one explained result: what it shows, what it means, evidence, impact, next step, optional details. */
export function TopicInfo({ topic }: { topic: Topic }) {
  return (
    <InfoPopover label={PAGE.aboutLabel(topic.title)} title={topic.title}>
      <InfoSection heading={TOPIC_SECTIONS.what}>{topic.what}</InfoSection>
      <InfoSection heading={TOPIC_SECTIONS.meaning}>{topic.meaning}</InfoSection>
      <InfoSection heading={TOPIC_SECTIONS.evidence}>{topic.evidence}</InfoSection>
      <InfoSection heading={TOPIC_SECTIONS.impact}>{topic.impact}</InfoSection>
      <InfoSection heading={TOPIC_SECTIONS.next}>{topic.next}</InfoSection>
      {topic.details && (
        <details className="mod-info-formula">
          <summary>{topic.details.heading}</summary>
          <ul>{topic.details.items.map((v) => <li key={v}>{v}</li>)}</ul>
        </details>
      )}
    </InfoPopover>
  );
}

/** Collapsed-by-default formula block. */
export function InfoFormula({ heading, formula, variablesHeading, variables }: {
  heading: string; formula: string; variablesHeading: string; variables: string[];
}) {
  return (
    <details className="mod-info-formula">
      <summary>{heading}</summary>
      <div className="mono mod-info-code">{formula}</div>
      <div className="mod-info-h" style={{ marginTop: 8 }}>{variablesHeading}</div>
      <ul>{variables.map((v) => <li key={v}>{v}</li>)}</ul>
    </details>
  );
}
