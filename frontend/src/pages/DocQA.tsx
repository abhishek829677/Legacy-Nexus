import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { LuBadgeCheck, LuBraces, LuCircleAlert, LuFileText, LuLoader, LuSend, LuTriangleAlert, LuUpload } from "react-icons/lu";
import { AppShell } from "../components/AppShell";
import { ConversationBar, FollowUpNote } from "../components/Conversation";
import { Markdown } from "../components/Markdown";
import { ConfidenceRing, useToast } from "../components/ui";
import { api } from "../lib/api";
import { SIGNIN_ROLES, useAuth } from "../lib/auth";
import { DOC_TYPES_LABEL } from "../lib/docUpload";
import { useApi } from "../lib/hooks";
import type { Conversation, DocAnswer, DocCitation, DocDocument } from "../lib/types";
import { DocumentInventory, UploadTray, useDocUploads, useFilePicker } from "./DocQAInventory";

const POLL_MS = 2000; // while a document is being read and indexed

export function DocQAPage() {
  const toast = useToast();
  const { signinRole } = useAuth();
  const role = signinRole; // answers are written for the role chosen at sign-in
  const roleLabel = SIGNIN_ROLES.find((r) => r.id === role)?.label ?? role;
  const { data: documents, reload: reloadDocs } = useApi<DocDocument[]>("/doc-qa/documents");

  const [docId, setDocId] = useState<number | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convId, setConvId] = useState<number | null>(null); // null = the next question starts a new conversation
  const [question, setQuestion] = useState("");
  const [thread, setThread] = useState<DocAnswer[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const uploads = useDocUploads(documents ?? null, (doc) => { setDocId(doc.id); reloadDocs(); });
  const picker = useFilePicker(uploads.add);

  const currentDoc = useMemo(() => documents?.find((d) => d.id === docId) ?? null, [documents, docId]);
  const ready = currentDoc?.status === "ready";

  // Pick up the most recent document once the list loads (or after the current one is deleted).
  useEffect(() => {
    if ((docId === null || (documents && !documents.some((d) => d.id === docId))) && documents && documents.length > 0) setDocId(documents[0].id);
    if (documents && documents.length === 0 && docId !== null) setDocId(null);
  }, [documents, docId]);

  // Keep the list fresh while any document is still being read and indexed.
  useEffect(() => {
    if (!documents?.some((d) => d.status === "processing")) return;
    const t = setTimeout(reloadDocs, POLL_MS);
    return () => clearTimeout(t);
  }, [documents, reloadDocs]);

  const loadConversations = (id: number, selectLatest = false) =>
    api.get<Conversation[]>(`/doc-qa/documents/${id}/conversations`).then((list) => {
      setConversations(list);
      if (selectLatest) setConvId(list[0]?.id ?? null);
    }).catch(() => setConversations([]));

  // Each document has its own conversations; open the latest one when the document changes.
  useEffect(() => {
    setConversations([]);
    setConvId(null);
    if (docId !== null) loadConversations(docId, true);
  }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show the selected conversation.
  useEffect(() => {
    if (docId === null || convId === null) { setThread([]); return; }
    let live = true;
    api.get<{ entries: DocAnswer[] }>(`/doc-qa/documents/${docId}/conversations/${convId}`)
      .then((c) => { if (live) setThread(c.entries); })
      .catch(() => { if (live) setThread([]); });
    return () => { live = false; };
  }, [docId, convId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread.length, pending]);

  const ask = async () => {
    const text = question.trim();
    if (text.length < 3 || pending || docId === null || !ready) return;
    setPending(text);
    setQuestion("");
    setError(null);
    try {
      const res = await api.post<DocAnswer>(`/doc-qa/documents/${docId}/ask`, convId === null
        ? { question: text, role, new_conversation: true }
        : { question: text, role, conversation_id: convId });
      setThread((t) => [...t, res]);
      if (res.conversation_id && res.conversation_id !== convId) setConvId(res.conversation_id);
      loadConversations(docId);
    } catch (e) {
      setError((e as Error).message);
      setQuestion(text);
    } finally {
      setPending(null);
    }
  };

  const removeDoc = async (id: number) => {
    const name = documents?.find((d) => d.id === id)?.filename ?? "this document";
    if (!confirm(`Delete “${name}” and its question history? This cannot be undone.`)) return;
    try {
      await api.del(`/doc-qa/documents/${id}`);
      toast("Document deleted");
      if (docId === id) setDocId(null);
      reloadDocs();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const removeConversation = async (id: number) => {
    if (docId === null || !confirm("Delete this conversation and its questions?")) return;
    try {
      await api.del(`/doc-qa/documents/${docId}/conversations/${id}`);
      toast("Conversation deleted");
      setConvId(null);
      loadConversations(docId, true);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const canSend = !pending && ready && question.trim().length >= 3;
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

  return (
    <AppShell title="Document Q&A">
      <div
        className="docqa chat"
        onDragEnter={(e) => { if (hasFiles(e)) { e.preventDefault(); setDragging((n) => n + 1); } }}
        onDragOver={(e) => { if (hasFiles(e)) e.preventDefault(); }}
        onDragLeave={(e) => { if (hasFiles(e)) setDragging((n) => Math.max(0, n - 1)); }}
        onDrop={(e) => { if (hasFiles(e)) { e.preventDefault(); setDragging(0); uploads.add(e.dataTransfer.files); } }}
      >
        {dragging > 0 && (
          <div className="drop-overlay" aria-hidden="true"><div><LuUpload size={26} /> Drop to upload<span className="subtle" style={{ fontWeight: 400 }}>{DOC_TYPES_LABEL}</span></div></div>
        )}
        <header className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0 }}>Document Q&amp;A</h1>
          <span className="tag tag-violet" title="Chosen when you signed in. Sign out to change it.">Answering as {roleLabel}</span>
          <div className="spacer" />
          {currentDoc && ready && (
            <ConversationBar conversations={conversations} currentId={convId} disabled={!!pending}
              onSelect={setConvId} onNew={() => { setConvId(null); setError(null); }} onDelete={removeConversation} />
          )}
        </header>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <DocumentInventory documents={documents ?? null} currentId={docId} onSelect={setDocId} onDelete={removeDoc} onUpload={picker.open} />
          <button type="button" className="btn" onClick={picker.open}><LuUpload size={15} /> Upload</button>
          {picker.element}
          <span className="subtle hide-sm" style={{ fontSize: 12.5 }}>or drop files anywhere on this page · large files upload in pieces and can be cancelled</span>
        </div>

        <div className="chat-thread">
          {thread.length === 0 && !pending && (
            <div className="chat-empty">
              {currentDoc?.status === "processing" ? <LuLoader size={28} color="var(--brand)" className="spin" /> : currentDoc?.status === "failed" ? <LuCircleAlert size={28} color="var(--red)" /> : <LuFileText size={28} color="var(--text-3)" />}
              <h2>
                {!documents ? "Loading your documents…"
                  : !currentDoc ? "Upload a document to start"
                  : currentDoc.status === "processing" ? `Reading and indexing ${currentDoc.filename}…`
                  : currentDoc.status === "failed" ? `${currentDoc.filename} could not be read`
                  : `Ask anything about ${currentDoc.filename}`}
              </h2>
              <p className="muted">
                {!documents ? null
                  : !currentDoc ? `Upload a ${DOC_TYPES_LABEL} file, or drop it on this page. Large files are sent in pieces with a progress bar.`
                  : currentDoc.status === "processing" ? "You can ask questions as soon as it is ready. This page updates on its own."
                  : currentDoc.status === "failed" ? `${currentDoc.error ?? "Processing failed."} Delete it from the Documents list and upload it again.`
                  : "Answers come only from this document and cite where they came from."}
              </p>
              {documents && !currentDoc && (
                <button type="button" className="btn btn-primary" style={{ marginTop: 14 }} onClick={picker.open}><LuUpload size={15} /> Upload a document</button>
              )}
            </div>
          )}

          {thread.map((a, i) => (
            <div key={a.id ?? `t${i}`} className="stack-sm" style={{ gap: 10 }}>
              <div className="q-bubble">{a.question}</div>
              <FollowUpNote context={a.context} />
              <DocAnswerCard a={a} />
            </div>
          ))}

          {pending && (
            <div className="stack-sm" style={{ gap: 10 }}>
              <div className="q-bubble">{pending}</div>
              <div className="card answer row"><span className="spinner" /> Reading the document and writing the answer…</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Upload progress and the message box, pinned to the bottom. */}
        <div className="ask-box">
          <UploadTray items={uploads.items} onCancel={uploads.cancel} onRetry={uploads.retry} onDismiss={uploads.dismiss} onClear={uploads.clearFinished} />
          {error && <div className="error-box" style={{ marginBottom: 8 }}>{error}</div>}
          <form className="ask-input composer" onSubmit={(e) => { e.preventDefault(); ask(); }}>
            <div className="composer-row">
              <textarea
                value={question}
                placeholder={!currentDoc ? "Upload a document first" : ready ? `Ask a question about ${currentDoc.filename}` : currentDoc.status === "processing" ? "Indexing the document…" : "This document could not be read"}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
                rows={1}
                disabled={!ready}
                aria-label="Your question"
              />
              <button className="btn btn-primary btn-icon" type="submit" disabled={!canSend} title="Send" aria-label="Send"><LuSend size={16} /></button>
            </div>
          </form>
          <div className="subtle" style={{ marginTop: 6, textAlign: "center", fontSize: 12 }}>Enter to send · Shift+Enter for a new line</div>
        </div>
      </div>
    </AppShell>
  );
}

/* ---------------- answer rendering ---------------- */

function modeTag(a: DocAnswer) {
  if (a.mode === "llm") return <span className="tag tag-blue">AI answer · {a.model}</span>;
  if (a.mode === "evidence_only") return <span className="tag">Relevant passages</span>;
  return <span className="tag tag-amber">Insufficient information</span>;
}

function DocAnswerCard({ a }: { a: DocAnswer }) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const v = a.validation || {};

  return (
    <div className={`card answer ${a.not_found ? "notfound" : ""}`}>
      <div className="row-wrap" style={{ alignItems: "flex-start", marginBottom: 14, gap: 8 }}>
        <ConfidenceRing value={a.confidence} label={a.confidence_label} />
        <div className="spacer" />
        <div className="row-wrap" style={{ justifyContent: "flex-end" }}>
          <span className="tag tag-violet">{a.role_label}</span>
          {modeTag(a)}
          {v.citations_total !== undefined && v.citations_total > 0 && (
            <span className={`tag ${v.citations_valid === v.citations_total ? "tag-green" : "tag-amber"}`}>
              <LuBadgeCheck size={13} /> {v.citations_valid}/{v.citations_total} citations verified
            </span>
          )}
        </div>
      </div>

      {a.not_found
        ? <div className="text"><LuCircleAlert size={16} style={{ verticalAlign: -2, marginRight: 6 }} />{a.answer}</div>
        : <Markdown text={a.answer} />}

      {a.abstain_reason && <div className="subtle" style={{ marginTop: 6 }}>{a.abstain_reason}</div>}
      {a.missing && <div className="warn-box" style={{ marginTop: 10 }}><LuTriangleAlert size={14} style={{ verticalAlign: -2 }} /> Not covered by the document: {a.missing}</div>}
      {a.warning && <div className="warn-box" style={{ marginTop: 10 }}>{a.warning}</div>}

      {a.citations.length > 0 && (
        <div className="stack-sm" style={{ marginTop: 14 }}>
          <div className="label">Sources</div>
          {a.citations.map((c, i) => <CitationRow key={i} c={c} />)}
        </div>
      )}

      {a.confidence_breakdown.length > 0 && (
        <details style={{ marginTop: 14 }}>
          <summary className="subtle" style={{ cursor: "pointer" }}>How the confidence score was computed</summary>
          <div className="breakdown" style={{ marginTop: 10 }}>
            {a.confidence_breakdown.map((p) => (
              <div key={p.name} style={{ display: "contents" }}>
                <span>{p.name} <span className="subtle">×{p.weight}</span></span>
                <div className="bar"><span style={{ width: `${p.value * 100}%` }} /></div>
                <span className="num">{p.value.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="row-wrap" style={{ marginTop: 12, gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowEvidence((s) => !s)}>
          {showEvidence ? "Hide" : "Show"} retrieved passages ({a.evidence.length})
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowJson((s) => !s)}><LuBraces size={14} /> {showJson ? "Hide" : "View"} JSON</button>
        <div className="spacer" />
        {a.usage && <span className="subtle">{a.usage.input_tokens + a.usage.output_tokens} tokens · {(a.usage.latency_ms / 1000).toFixed(1)}s</span>}
      </div>

      {showEvidence && (
        <div className="stack-sm" style={{ marginTop: 10 }}>
          {a.evidence.map((e, i) => (
            <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
              <div className="row" style={{ padding: "8px 12px", background: "var(--surface-2)", fontSize: 13 }}>
                <b>[S{e.source}]</b> <span>{e.title}</span>
              </div>
              <div style={{ margin: 0, padding: 12, fontSize: 13, whiteSpace: "pre-wrap", color: "var(--text-2)" }}>{e.snippet}</div>
            </div>
          ))}
        </div>
      )}
      {showJson && (
        <pre className="mono" style={{ marginTop: 10, padding: 12, fontSize: 12, background: "#0f1d33", color: "#d5dfec", borderRadius: 8, overflowX: "auto" }}>
          {JSON.stringify({ role: a.role, answer: a.answer, not_found: a.not_found, confidence: a.confidence,
            citations: a.citations.map((c) => ({ source: c.source, page: c.page, section: c.section, verified: c.valid })),
            missing: a.missing }, null, 2)}
        </pre>
      )}
    </div>
  );
}

function CitationRow({ c }: { c: DocCitation }) {
  const [open, setOpen] = useState(false);
  const where = c.title || (c.page ? `page ${c.page}` : "excerpt");
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px" }}>
      <div className="row-wrap" style={{ gap: 8 }}>
        <span className={`cite ${c.valid ? "" : "bad"}`} title={c.reason ?? "Verified against the document"}
          onClick={() => c.snippet && setOpen((s) => !s)} style={{ cursor: c.snippet ? "pointer" : "default" }}>
          [S{c.source}] {where}
        </span>
        {c.note && <span className="subtle" style={{ flex: 1, minWidth: 0 }}>{c.note}</span>}
        {!c.valid && <span className="tag tag-amber">unverified</span>}
      </div>
      {open && c.snippet && <div className="subtle" style={{ marginTop: 8, whiteSpace: "pre-wrap", fontSize: 13 }}>{c.snippet}</div>}
    </div>
  );
}
