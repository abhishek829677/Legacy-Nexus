import { useEffect, useRef, useState } from "react";
import { LuHistory, LuMessageSquarePlus, LuMessageSquareText, LuTrash2 } from "react-icons/lu";
import type { AnswerContext, Conversation } from "../lib/types";

type ConversationBarProps = {
  conversations: Conversation[];
  currentId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete?: (id: number) => void;
  disabled?: boolean;
  /** "bar" (default): dropdown + buttons. "header": chat title with history and new-chat icons. */
  variant?: "bar" | "header";
};

/** Pick a past conversation or start a new one. Used by Ask the code and Document Q&A. */
export function ConversationBar({ conversations, currentId, onSelect, onNew, onDelete, disabled, variant = "bar" }: ConversationBarProps) {
  if (variant === "header") {
    return <ConversationHeader conversations={conversations} currentId={currentId} onSelect={onSelect} onNew={onNew} onDelete={onDelete} disabled={disabled} />;
  }
  const current = conversations.find((c) => c.id === currentId);
  return (
    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      {conversations.length > 0 && (
        <select className="select" style={{ maxWidth: 320 }} value={currentId ?? ""} disabled={disabled}
          onChange={(e) => e.target.value && onSelect(Number(e.target.value))} aria-label="Conversation">
          {currentId === null && <option value="">New conversation</option>}
          {conversations.map((c) => (
            <option key={c.id} value={c.id}>{c.title}{c.turns ? ` (${c.turns})` : ""}</option>
          ))}
        </select>
      )}
      <button type="button" className="btn btn-sm" onClick={onNew} disabled={disabled}
        title="Start a new conversation. Follow-up questions are read against the current conversation only.">
        <LuMessageSquarePlus size={15} /> New conversation
      </button>
      {onDelete && current && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(current.id)} disabled={disabled}
          title="Delete this conversation" aria-label="Delete this conversation">
          <LuTrash2 size={14} />
        </button>
      )}
    </div>
  );
}

/**
 * Chat-style header: the current conversation's name, plus a history icon (lists past
 * conversations, each with its own delete button) and a new-conversation icon.
 * Same callbacks as the bar: onSelect, onNew, onDelete.
 */
function ConversationHeader({ conversations, currentId, onSelect, onNew, onDelete, disabled }: Omit<ConversationBarProps, "variant">) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  const current = conversations.find((c) => c.id === currentId);
  const title = current ? current.title : "New conversation";

  return (
    <div className="row conv-head" ref={ref}>
      <div className="conv-head-title" title={title}>
        <LuMessageSquareText size={16} aria-hidden="true" />
        <span className="conv-head-name">{title}</span>
        {!!current?.turns && <span className="conv-head-turns">{current.turns} {current.turns === 1 ? "question" : "questions"}</span>}
      </div>
      <div className="spacer" />
      <button type="button" className={`conv-head-btn ${open ? "on" : ""}`} onClick={() => setOpen((o) => !o)} disabled={disabled}
        aria-haspopup="menu" aria-expanded={open} title="Conversation history" aria-label="Conversation history">
        <LuHistory size={17} />
      </button>
      <button type="button" className="conv-head-btn" onClick={() => { setOpen(false); onNew(); }} disabled={disabled}
        title="Start a new conversation. Follow-up questions are read against the current conversation only." aria-label="New conversation">
        <LuMessageSquarePlus size={17} />
      </button>

      {open && (
        <div className="conv-pop" role="menu" aria-label="Conversation history">
          <div className="conv-pop-head">History<span className="conv-pop-count">{conversations.length}</span></div>
          {conversations.length === 0 ? (
            <div className="conv-pop-empty">No conversations yet. Ask a question to start one.</div>
          ) : (
            <ul className="conv-pop-list">
              {conversations.map((c) => (
                <li key={c.id} className={`conv-pop-row ${c.id === currentId ? "on" : ""}`}>
                  <button type="button" className="conv-pop-item" role="menuitem" title={c.title}
                    onClick={() => { setOpen(false); onSelect(c.id); }}>
                    <span className="conv-pop-title">{c.title}</span>
                    {!!c.turns && <span className="conv-pop-meta">{c.turns}</span>}
                  </button>
                  {onDelete && (
                    <button type="button" className="conv-pop-del" title="Delete this conversation" aria-label={`Delete conversation ${c.title}`}
                      onClick={() => { setOpen(false); onDelete(c.id); }}>
                      <LuTrash2 size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** One line under a follow-up question saying how it was understood. */
export function FollowUpNote({ context }: { context?: AnswerContext }) {
  if (!context?.follow_up) return null;
  return (
    <div className="subtle" style={{ fontSize: 12.5, alignSelf: "flex-end", marginTop: -4 }}>
      {context.resolved_question
        ? <>Follow-up, read as: “{context.resolved_question}”</>
        : <>Follow-up, answered with the previous {context.turns_used === 1 ? "question" : `${context.turns_used} questions`} in mind</>}
    </div>
  );
}
