import { useCallback, useEffect, useRef, useState } from "react";
import { LuCheck, LuChevronDown, LuCircleAlert, LuFileText, LuLoader, LuRotateCw, LuSearch, LuTrash2, LuUpload, LuX } from "react-icons/lu";
import { UploadCancelled, type Progress } from "../lib/chunkedUpload";
import { DOC_ACCEPT, DOC_TYPES_LABEL, fmtBytes, isDocFile, uploadDocument } from "../lib/docUpload";
import { fmtDate } from "../lib/format";
import type { DocDocument } from "../lib/types";
import "./docqa-inventory.css";

/* ---------------- document inventory dropdown ---------------- */

export function DocumentInventory({ documents, currentId, onSelect, onDelete, onUpload }: {
  documents: DocDocument[] | null; currentId: number | null; onSelect: (id: number) => void; onDelete: (id: number) => void; onUpload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const current = documents?.find((d) => d.id === currentId) ?? null;
  const list = (documents ?? []).filter((d) => d.filename.toLowerCase().includes(q.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); ref.current?.querySelector<HTMLButtonElement>(".inv-trigger")?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(".inv-pop input, .inv-pop .inv-pick")?.focus());
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="inv" ref={ref}>
      <button type="button" className="inv-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <LuFileText size={16} aria-hidden="true" />
        <span className="inv-current">{current ? current.filename : documents?.length ? "Choose a document" : "No documents yet"}</span>
        {current && <StatusBadge doc={current} compact />}
        <span className="inv-count" aria-label={`${documents?.length ?? 0} documents`}>{documents?.length ?? 0}</span>
        <LuChevronDown size={15} className="inv-chev" aria-hidden="true" />
      </button>
      {open && (
        <div className="inv-pop" role="dialog" aria-label="Your documents">
          <div className="inv-head">
            <b>Your documents</b>
            <span className="subtle">{documents?.length ?? 0}</span>
          </div>
          {(documents?.length ?? 0) > 5 && (
            <div className="inv-search">
              <LuSearch size={14} aria-hidden="true" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a document" aria-label="Find a document" />
            </div>
          )}
          <ul className="inv-list">
            {list.length === 0 && <li className="inv-empty">{documents?.length ? `No documents match “${q}”.` : "Nothing uploaded yet."}</li>}
            {list.map((d) => (
              <li key={d.id} className={`inv-row ${d.id === currentId ? "on" : ""}`}>
                <button type="button" className="inv-pick" aria-current={d.id === currentId} onClick={() => { onSelect(d.id); setOpen(false); }}>
                  <span className={`inv-fmt fmt-${d.format}`}>{d.format.toUpperCase()}</span>
                  <span className="inv-text">
                    <span className="inv-name" title={d.filename}>{d.filename}</span>
                    <span className="inv-meta">
                      {[d.page_count ? `${d.page_count} pages` : null, fmtBytes(d.size_bytes), fmtDate(d.created_at as unknown as string)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <StatusBadge doc={d} />
                  {d.id === currentId && <LuCheck size={15} className="inv-tick" aria-hidden="true" />}
                </button>
                <button type="button" className="inv-del" aria-label={`Delete ${d.filename}`} title="Delete this document and its questions"
                  onClick={() => onDelete(d.id)}><LuTrash2 size={15} /></button>
              </li>
            ))}
          </ul>
          <div className="inv-foot">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { setOpen(false); onUpload(); }}><LuUpload size={14} /> Upload document</button>
            <span className="subtle">{DOC_TYPES_LABEL}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ doc, compact }: { doc: DocDocument; compact?: boolean }) {
  if (doc.status === "processing") return <span className="tag tag-blue inv-status"><LuLoader size={12} className="spin" aria-hidden="true" /> {compact ? "Indexing" : "Processing"}</span>;
  if (doc.status === "failed") return <span className="tag tag-red inv-status" title={doc.error ?? ""}><LuCircleAlert size={12} aria-hidden="true" /> Failed</span>;
  return null;
}

/* ---------------- uploads: queue, progress tray, drop target ---------------- */

export type UploadItem = {
  key: string;
  file: File;
  phase: "queued" | "uploading" | "processing" | "ready" | "failed" | "cancelled";
  progress: Progress | null;
  error?: string;
  docId?: number;
  controller?: AbortController;
};

/**
 * Upload queue for Document Q&A: one file at a time (each sends several pieces in parallel).
 * After the upload the server reads and indexes the document; `documents` (polled by the page) tells
 * us when that has finished.
 */
export function useDocUploads(documents: DocDocument[] | null, onUploaded: (doc: DocDocument) => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const running = useRef(false);
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;

  const patch = useCallback((key: string, p: Partial<UploadItem>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i))), []);

  const add = useCallback((files: FileList | File[] | null) => {
    if (!files) return;
    const next = Array.from(files).map((file): UploadItem => ({
      key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      phase: isDocFile(file.name) ? "queued" : "failed",
      progress: null,
      error: isDocFile(file.name) ? undefined : `Unsupported file type. Use ${DOC_TYPES_LABEL}.`,
    }));
    setItems((list) => [...list, ...next]);
  }, []);

  // Work through the queue one file at a time.
  useEffect(() => {
    if (running.current) return;
    const item = items.find((i) => i.phase === "queued");
    if (!item) return;
    running.current = true;
    const controller = new AbortController();
    patch(item.key, { phase: "uploading", controller, error: undefined });
    uploadDocument(item.file, { signal: controller.signal, onProgress: (p) => patch(item.key, { progress: p }) })
      .then((doc) => {
        patch(item.key, { phase: doc.status === "ready" ? "ready" : "processing", docId: doc.id, controller: undefined });
        onUploadedRef.current(doc);
      })
      .catch((e) => patch(item.key, e instanceof UploadCancelled
        ? { phase: "cancelled", controller: undefined }
        : { phase: "failed", error: (e as Error).message, controller: undefined }))
      .finally(() => { running.current = false; setItems((l) => [...l]); });
  }, [items, patch]);

  // Follow server-side processing through the polled document list.
  useEffect(() => {
    if (!documents) return;
    setItems((list) => {
      let changed = false;
      const out = list.map((i) => {
        if (i.phase !== "processing" || i.docId === undefined) return i;
        const d = documents.find((x) => x.id === i.docId);
        if (!d) { changed = true; return { ...i, phase: "failed" as const, error: "The document was removed." }; }
        if (d.status === "ready") { changed = true; return { ...i, phase: "ready" as const }; }
        if (d.status === "failed") { changed = true; return { ...i, phase: "failed" as const, error: d.error ?? "Processing failed." }; }
        return i;
      });
      return changed ? out : list;
    });
  }, [documents]);

  const cancel = (key: string) => {
    const it = items.find((i) => i.key === key);
    if (it?.controller) it.controller.abort();
    else if (it?.phase === "queued") patch(key, { phase: "cancelled" });
  };
  const retry = (key: string) => patch(key, { phase: "queued", progress: null, error: undefined, docId: undefined });
  const dismiss = (key: string) => setItems((l) => l.filter((i) => i.key !== key));
  const clearFinished = () => setItems((l) => l.filter((i) => !["ready", "cancelled"].includes(i.phase)));

  return { items, add, cancel, retry, dismiss, clearFinished };
}

const PHASE_LABEL: Record<UploadItem["phase"], string> = {
  queued: "Waiting", uploading: "Uploading", processing: "Reading and indexing", ready: "Ready", failed: "Failed", cancelled: "Cancelled",
};

export function UploadTray({ items, onCancel, onRetry, onDismiss, onClear }: {
  items: UploadItem[]; onCancel: (k: string) => void; onRetry: (k: string) => void; onDismiss: (k: string) => void; onClear: () => void;
}) {
  if (!items.length) return null;
  const finished = items.some((i) => i.phase === "ready" || i.phase === "cancelled");
  return (
    <section className="tray" aria-label="Uploads" aria-live="polite">
      <div className="tray-head">
        <b>Uploads</b>
        <span className="spacer" />
        {finished && <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>Clear finished</button>}
      </div>
      {items.map((i) => {
        const pct = i.progress ? Math.round((i.progress.sent / Math.max(1, i.progress.total)) * 100) : 0;
        const showBar = i.phase === "uploading" || i.phase === "processing";
        return (
          <div key={i.key} className={`tray-row ph-${i.phase}`}>
            <LuFileText size={16} className="tray-ico" aria-hidden="true" />
            <div className="tray-main">
              <div className="tray-line">
                <span className="tray-name" title={i.file.name}>{i.file.name}</span>
                <span className="tray-phase">
                  {i.phase === "uploading" && i.progress ? `${PHASE_LABEL.uploading} ${pct}% · ${fmtBytes(i.progress.sent)} of ${fmtBytes(i.progress.total)}` : PHASE_LABEL[i.phase]}
                </span>
              </div>
              {showBar && (
                <div className={`tray-bar ${i.phase === "processing" ? "indeterminate" : ""}`} role="progressbar" aria-label={`${i.file.name}: ${PHASE_LABEL[i.phase]}`}
                  aria-valuemin={0} aria-valuemax={100} aria-valuenow={i.phase === "uploading" ? pct : undefined}>
                  <span style={i.phase === "uploading" ? { width: `${pct}%` } : undefined} />
                </div>
              )}
              {i.phase === "uploading" && i.progress && i.progress.chunksTotal > 1 && (
                <div className="tray-sub">Piece {Math.min(i.progress.chunksDone + 1, i.progress.chunksTotal)} of {i.progress.chunksTotal}</div>
              )}
              {i.error && <div className="tray-err">{i.error}</div>}
            </div>
            <div className="tray-actions">
              {(i.phase === "uploading" || i.phase === "queued") && <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onCancel(i.key)} aria-label={`Cancel ${i.file.name}`} title="Cancel"><LuX size={15} /></button>}
              {(i.phase === "failed" || i.phase === "cancelled") && isDocFile(i.file.name) && <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onRetry(i.key)} aria-label={`Retry ${i.file.name}`} title="Try again"><LuRotateCw size={15} /></button>}
              {(i.phase === "ready" || i.phase === "failed" || i.phase === "cancelled") && <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onDismiss(i.key)} aria-label={`Dismiss ${i.file.name}`} title="Dismiss"><LuX size={15} /></button>}
              {i.phase === "ready" && <LuCheck size={16} className="tray-ok" aria-label="Ready" />}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** Hidden file input plus a function that opens it. */
export function useFilePicker(onFiles: (f: FileList | null) => void) {
  const input = useRef<HTMLInputElement>(null);
  const element = <input ref={input} type="file" multiple accept={DOC_ACCEPT} hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} data-testid="doc-file-input" />;
  return { open: () => input.current?.click(), element };
}
