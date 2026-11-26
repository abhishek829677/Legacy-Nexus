import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { LuBot, LuCircleHelp, LuFileText, LuFolderKanban, LuMessageSquareText, LuTrash2 } from "react-icons/lu";
import "./confirm-dialog.css";

/**
 * App-styled replacement for window.confirm().
 *
 *   if (!(await confirmAction({ title: "Delete “x”?", message: "…", confirmLabel: "Delete" }))) return;
 *
 * Resolves true on confirm, false on Cancel / Escape / clicking outside — the same yes/no that
 * window.confirm() returned, so callers keep their exact behaviour. <ConfirmHost/> is mounted once in
 * main.tsx; when it is not mounted (e.g. in unit tests) this falls back to window.confirm().
 */
export type ConfirmOptions = {
  /** Short question, e.g. "Delete document?". */
  title: string;
  /** The item's name (file, application, model…), shown on its own line and trimmed with … if long. */
  subject?: string;
  /** Picks the small icon shown next to the subject. */
  subjectKind?: "document" | "application" | "conversation" | "model";
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" (default): red, for deletes. "default": brand colour, for ordinary confirmations. */
  tone?: "danger" | "default";
};

type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

let openHost: ((r: Request) => void) | null = null;

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  const host = openHost;
  if (host) return new Promise<boolean>((resolve) => host({ ...options, resolve }));
  const text = [options.title, options.subject ?? "", typeof options.message === "string" ? options.message : ""].filter(Boolean).join("\n\n");
  return Promise.resolve(window.confirm(text));
}

const EXIT_MS = 160;

export function ConfirmHost() {
  const [req, setReq] = useState<Request | null>(null);
  const [closing, setClosing] = useState(false);
  const current = useRef<Request | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  const exitTimer = useRef<number | undefined>(undefined);
  const titleId = useId();
  const msgId = useId();

  useEffect(() => {
    openHost = (r) => {
      current.current?.resolve(false); // a newer request replaces one still open
      window.clearTimeout(exitTimer.current);
      current.current = r;
      returnFocus.current = document.activeElement as HTMLElement | null;
      setClosing(false);
      setReq(r);
    };
    return () => { openHost = null; };
  }, []);

  const finish = useCallback((ok: boolean) => {
    const r = current.current;
    if (!r) return;
    current.current = null;
    r.resolve(ok); // the caller continues right away; the dialog animates out meanwhile
    setClosing(true);
    exitTimer.current = window.setTimeout(() => {
      setReq(null);
      setClosing(false);
      returnFocus.current?.focus?.();
    }, EXIT_MS);
  }, []);

  // Focus Cancel when it opens (the safe choice for destructive actions).
  useEffect(() => {
    if (req && !closing) requestAnimationFrame(() => cancelRef.current?.focus());
  }, [req, closing]);

  // Escape cancels; Tab stays inside the dialog.
  useEffect(() => {
    if (!req || closing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); return; }
      if (e.key === "Tab") {
        const order = [cancelRef.current, okRef.current].filter(Boolean) as HTMLElement[];
        const i = order.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        order[(i + (e.shiftKey ? order.length - 1 : 1)) % order.length]?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [req, closing, finish]);

  if (!req) return null;
  const danger = (req.tone ?? "danger") === "danger";
  const SubjectIcon = { document: LuFileText, application: LuFolderKanban, conversation: LuMessageSquareText, model: LuBot }[req.subjectKind ?? "document"];

  return (
    <div className={`cf-backdrop ${closing ? "is-out" : ""}`} onMouseDown={(e) => { if (e.target === e.currentTarget) finish(false); }}>
      <div className={`cf-card ${danger ? "cf-danger" : "cf-default"}`} role="alertdialog" aria-modal="true"
        aria-labelledby={titleId} aria-describedby={req.message ? msgId : undefined}>
        <div className="cf-body">
          <div className="cf-icon" aria-hidden="true">{danger ? <LuTrash2 size={22} /> : <LuCircleHelp size={22} />}</div>
          <div className="cf-text">
            <h2 id={titleId} className="cf-title">{req.title}</h2>
            {req.subject && (
              <div className="cf-subject" title={req.subject}>
                <SubjectIcon size={15} aria-hidden="true" />
                <span className="cf-subject-name">{req.subject}</span>
              </div>
            )}
            {req.message && <div id={msgId} className="cf-msg">{req.message}</div>}
          </div>
        </div>
        <div className="cf-foot">
          <button ref={cancelRef} type="button" className="btn cf-cancel" onClick={() => finish(false)}>{req.cancelLabel ?? "Cancel"}</button>
          <button ref={okRef} type="button" className={`btn cf-ok ${danger ? "cf-ok-danger" : "cf-ok-default"}`} onClick={() => finish(true)}>
            {danger && <LuTrash2 size={15} aria-hidden="true" />}
            <span>{req.confirmLabel ?? (danger ? "Delete" : "Confirm")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
