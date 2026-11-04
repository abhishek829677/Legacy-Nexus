import { useEffect, useId, useMemo, useRef, useState, type ComponentType } from "react";
import { LuArrowRight, LuCircleHelp, LuCommand, LuFileText, LuFolderKanban, LuLogOut, LuPanelLeft, LuSearch, LuSettings, LuUserRound } from "react-icons/lu";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { navigate } from "../lib/router";
import type { Project } from "../lib/types";
import "./command-palette.css";

type Icon = ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
export type Command = { id: string; group: string; label: string; hint?: string; keywords?: string; icon: Icon; run: () => void };

/** Scores how well a query matches: whole-word start > substring > letters in order. 0 means no match. */
export function matchScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const t = text.toLowerCase();
  if (t.startsWith(q)) return 4;
  if (t.split(/[\s/·-]+/).some((w) => w.startsWith(q))) return 3;
  if (t.includes(q)) return 2;
  let i = 0;
  for (const ch of t) if (ch === q[i]) i++;
  return i === q.length ? 1 : 0;
}

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Ctrl+K / ⌘K quick navigation. `pages` are the current application's pages, when inside one. */
export function CommandPalette({ pages, projectId, onToggleMenu, onGuide }: {
  pages: { path: string; label: string; icon: Icon }[]; projectId?: number; onToggleMenu: () => void; onGuide?: () => void;
}) {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const listId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("lnx:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("lnx:palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement as HTMLElement | null;
    setQ("");
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
    if (!projects) api.get<Project[]>("/projects").then(setProjects).catch(() => setProjects([]));
    return () => restoreFocus.current?.focus?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => setOpen(false);
  const go = (to: string) => () => navigate(to);

  const commands: Command[] = useMemo(() => {
    const list: Command[] = [];
    if (projectId) {
      for (const p of pages) {
        list.push({ id: `page:${p.path}`, group: "This application", label: p.label, icon: p.icon, run: go(p.path ? `/projects/${projectId}/${p.path}` : `/projects/${projectId}`) });
      }
    }
    for (const p of projects ?? []) {
      if (p.id === projectId) continue;
      list.push({ id: `project:${p.id}`, group: "Applications", label: p.name, hint: p.status === "ready" ? "Open" : p.status, keywords: "project application", icon: LuFolderKanban, run: go(`/projects/${p.id}`) });
    }
    list.push(
      { id: "nav:projects", group: "Go to", label: "All applications", keywords: "projects home", icon: LuFolderKanban, run: go("/projects") },
      { id: "nav:docqa", group: "Go to", label: "Document Q&A", keywords: "documents questions", icon: LuFileText, run: go("/doc-qa") },
      { id: "nav:settings", group: "Go to", label: "Settings", keywords: "ai model users", icon: LuSettings, run: go("/settings") },
      { id: "nav:account", group: "Go to", label: "My account", keywords: "profile password", icon: LuUserRound, run: go("/settings?tab=account") },
      { id: "act:menu", group: "Actions", label: "Hide or show the menu", hint: isMac() ? "⌘B" : "Ctrl+B", keywords: "sidebar", icon: LuPanelLeft, run: onToggleMenu },
    );
    if (onGuide) list.push({ id: "act:guide", group: "Actions", label: "Show the guide for this page", keywords: "help tour", icon: LuCircleHelp, run: onGuide });
    list.push({ id: "act:logout", group: "Actions", label: "Sign out", keywords: "logout exit", icon: LuLogOut, run: logout });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, projectId, projects, onGuide]);

  const results = useMemo(() => {
    return commands
      .map((c, i) => ({ c, i, s: Math.max(matchScore(q, c.label), matchScore(q, c.keywords ?? "") > 0 ? 1 : 0) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => (q.trim() ? b.s - a.s : 0) || a.i - b.i)
      .map((x) => x.c);
  }, [commands, q]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const runAt = (i: number) => {
    const c = results[i];
    if (!c) return;
    close();
    c.run();
  };

  let lastGroup = "";
  return (
    <div className="cp-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="cp" role="dialog" aria-modal="true" aria-label="Quick search">
        <div className="cp-input">
          <LuSearch size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            placeholder="Search pages, applications and actions…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { setActive((a) => Math.min(results.length - 1, a + 1)); e.preventDefault(); }
              else if (e.key === "ArrowUp") { setActive((a) => Math.max(0, a - 1)); e.preventDefault(); }
              else if (e.key === "Home") { setActive(0); e.preventDefault(); }
              else if (e.key === "End") { setActive(results.length - 1); e.preventDefault(); }
              else if (e.key === "Enter") { runAt(active); e.preventDefault(); }
              else if (e.key === "Escape") { close(); e.preventDefault(); }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div ref={listRef} id={listId} className="cp-list" role="listbox" aria-label="Results">
          {results.length === 0 && <div className="cp-empty">No matches for “{q}”.</div>}
          {results.map((c, i) => {
            const head = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <div key={c.id} role="presentation">
                {head && <div className="cp-group" role="presentation">{head}</div>}
                <div
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  className={`cp-item ${i === active ? "on" : ""}`}
                  onMouseMove={() => setActive(i)}
                  onClick={() => runAt(i)}
                >
                  <span className="cp-ico"><c.icon size={16} aria-hidden={true} /></span>
                  <span className="cp-label">{c.label}</span>
                  {c.hint && <span className="cp-hint">{c.hint}</span>}
                  <LuArrowRight size={14} className="cp-go" aria-hidden="true" />
                </div>
              </div>
            );
          })}
        </div>
        <div className="cp-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>Enter</kbd> open</span>
          <span className="spacer" />
          <span className="cp-brand"><LuCommand size={13} aria-hidden="true" /> LegacyNexus</span>
        </div>
      </div>
    </div>
  );
}
