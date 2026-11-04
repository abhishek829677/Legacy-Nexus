import { useId, useState, type ReactNode } from "react";
import { LuChevronDown, LuLightbulb } from "react-icons/lu";
import { Modal } from "./ui";
import "./page-guide.css";

export type Guide = { title: string; steps: ReactNode[]; terms?: [string, ReactNode][] };

const KEY = (id: string) => `lnx.guide.${id}.closed`;

/** "How to read this page": three short steps and an optional glossary. Open on first visit; remembers when closed. */
export function PageGuide({ id, guide }: { id: string; guide: Guide }) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(KEY(id)) !== "1"; } catch { return true; }
  });
  const bodyId = useId();
  const toggle = () => {
    setOpen((o) => {
      try { localStorage.setItem(KEY(id), o ? "1" : "0"); } catch { /* storage unavailable: still toggles */ }
      return !o;
    });
  };
  return (
    <section className={`pg ${open ? "open" : ""}`} aria-label={guide.title}>
      <button type="button" className="pg-head" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
        <span className="pg-icon"><LuLightbulb size={16} aria-hidden="true" /></span>
        <span className="pg-title">{guide.title}</span>
        <span className="pg-hint">{open ? "Hide" : "Show"}</span>
        <LuChevronDown size={16} className="pg-chev" aria-hidden="true" />
      </button>
      <div id={bodyId} className="pg-body" hidden={!open}>
        <GuideBody guide={guide} />
      </div>
    </section>
  );
}

function GuideBody({ guide, stacked }: { guide: Guide; stacked?: boolean }) {
  return (
    <>
      <ol className={`pg-steps ${stacked ? "pg-stacked" : ""}`}>
        {guide.steps.map((s, i) => <li key={i}><span className="pg-n">{i + 1}</span><span>{s}</span></li>)}
      </ol>
      {guide.terms && (
        <dl className="pg-terms">
          {guide.terms.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}
        </dl>
      )}
    </>
  );
}

/** Toolbar button that opens the guide in a dialog; used on full-screen canvases where an inline panel would cost space. */
export function GuideButton({ guide }: { guide: Guide }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} title={guide.title}>
        <LuLightbulb size={15} aria-hidden="true" /> <span className="hide-sm">How to read this</span>
      </button>
      {open && (
        <Modal title={guide.title} onClose={() => setOpen(false)} footer={<button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>Got it</button>}>
          <GuideBody guide={guide} stacked />
        </Modal>
      )}
    </>
  );
}
