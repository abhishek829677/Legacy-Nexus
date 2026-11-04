import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { LuChevronDown, LuChevronRight, LuFileCode2, LuFolder, LuFolderOpen, LuSearch, LuX } from "react-icons/lu";
import { AppShell } from "../components/AppShell";
import { useProject } from "../components/ProjectContext";
import { CodeView, ErrorBox, Loading } from "../components/ui";
import { qs } from "../lib/api";
import { useApi } from "../lib/hooks";
import { navigate, useSearchParam } from "../lib/router";
import { ancestors, buildTree, filterFiles, flatten, rowCovers, type FileRow, type Row } from "./fileTree";
import "./files.css";

const MAX_ROWS = 1500; // keeps very large searches responsive

const TEXT = {
  title: "Source files",
  heading: "Files",
  filter: "Filter files and folders",
  clearFilter: "Clear filter",
  tree: "Project files",
  loading: "Loading files",
  noFiles: "This project has no files.",
  noMatch: (q: string) => `No files match “${q}”.`,
  tooMany: (shown: number) => `Showing the first ${shown.toLocaleString("en-US")} rows. Type more to narrow the list.`,
  count: (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "file" : "files"}`,
  lines: (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "line" : "lines"}`,
  breadcrumb: "File location",
  pickFile: "Choose a file on the left to see its code.",
  keys: "Use the arrow keys to move, Right and Left to open and close folders, Enter to open a file.",
};

export function FilesPage() {
  const { project } = useProject();
  const pid = project!.id;
  const selected = useSearchParam("path");
  const line = Number(useSearchParam("line") || 0) || undefined;
  const [filter, setFilter] = useState("");
  const { data: files, error } = useApi<FileRow[]>(`/projects/${pid}/files`);
  const { data: content, loading } = useApi<{ lines: string[] }>(selected ? `/projects/${pid}/files/content${qs({ path: selected })}` : null);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<{ path: string; focus: boolean } | null>(null);

  useEffect(() => {
    if (!selected && files?.length) navigate(`/projects/${pid}/files?path=${encodeURIComponent(files[0].path)}`, true);
  }, [files, selected, pid]);

  const searching = filter.trim().length > 0;
  const tree = useMemo(() => buildTree(filterFiles(files ?? [], filter)), [files, filter]);
  const rows = useMemo(() => flatten(tree, expanded, searching), [tree, expanded, searching]);
  const visible = rows.length > MAX_ROWS ? rows.slice(0, MAX_ROWS) : rows;

  // Opening a file (also from "Open in files" on other pages) reveals it in the tree.
  useEffect(() => {
    if (!selected) return;
    setExpanded((s) => new Set([...s, ...ancestors(selected)]));
    setFocused(selected);
    pendingScroll.current = { path: selected, focus: false };
  }, [selected]);

  const rowEl = (path: string) =>
    Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-path]") ?? []).find((el) => el.dataset.path === path);

  // Scroll (and optionally focus) a row once it has been rendered.
  useEffect(() => {
    const p = pendingScroll.current;
    if (!p) return;
    const el = rowEl(p.path);
    if (!el) return;
    pendingScroll.current = null;
    el.scrollIntoView?.({ block: "nearest" });
    if (p.focus) el.focus();
  }, [visible]);

  const moveTo = (path: string) => {
    setFocused(path);
    pendingScroll.current = { path, focus: true };
    const el = rowEl(path);
    if (el) {
      pendingScroll.current = null;
      el.focus();
      el.scrollIntoView?.({ block: "nearest" });
    }
  };

  const toggle = (path: string, open?: boolean) =>
    setExpanded((s) => {
      const n = new Set(s);
      const next = open ?? !n.has(path);
      if (next) n.add(path);
      else n.delete(path);
      return n;
    });

  const openFile = (path: string) => navigate(`/projects/${pid}/files?path=${encodeURIComponent(path)}`);

  const activate = (r: Row) => {
    if (r.node.kind === "file") openFile(r.node.path);
    else if (!searching) toggle(r.node.path);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!visible.length) return;
    const i = Math.max(0, visible.findIndex((r) => r.node.path === focused));
    const r = visible[i];
    const go = (j: number) => moveTo(visible[Math.min(visible.length - 1, Math.max(0, j))].node.path);
    switch (e.key) {
      case "ArrowDown": go(i + 1); break;
      case "ArrowUp": go(i - 1); break;
      case "Home": go(0); break;
      case "End": go(visible.length - 1); break;
      case "ArrowRight":
        if (r.node.kind === "dir") {
          if (!r.open) toggle(r.node.path, true);
          else go(i + 1);
        }
        break;
      case "ArrowLeft":
        if (r.node.kind === "dir" && r.open && !searching) toggle(r.node.path, false);
        else if (r.parent) moveTo(r.parent);
        break;
      case "Enter":
      case " ":
        activate(r);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  // Breadcrumb: clicking a folder shows it in the tree.
  const revealFolder = (folder: string) => {
    setFilter("");
    setExpanded((s) => new Set([...s, ...ancestors(`${folder}/x`)]));
    const row = flatten(buildTree(files ?? []), new Set([...expanded, ...ancestors(`${folder}/x`)])).find(
      (x) => x.node.kind === "dir" && rowCovers(x.node, folder),
    );
    if (row) {
      setFocused(row.node.path);
      pendingScroll.current = { path: row.node.path, focus: true };
    }
  };

  const crumbs = selected ? selected.split("/").filter(Boolean) : [];
  const focusPath = visible.some((r) => r.node.path === focused) ? focused : visible[0]?.node.path;
  const fileCount = files?.length ?? 0;

  return (
    <AppShell title={TEXT.title}>
      {error && <ErrorBox message={error} />}
      <div className="ft-layout">
        <div className="card ft-panel">
          <div className="card-head ft-head"><h3>{TEXT.heading}</h3>{files && <span className="subtle">{TEXT.count(fileCount)}</span>}</div>
          <div className="ft-search">
            <LuSearch size={15} aria-hidden="true" />
            <input className="input" aria-label={TEXT.filter} placeholder={TEXT.filter} value={filter} onChange={(e) => setFilter(e.target.value)} />
            {filter && <button type="button" className="ft-clear" aria-label={TEXT.clearFilter} onClick={() => setFilter("")}><LuX size={14} /></button>}
          </div>
          <div ref={listRef} className="ft-list" role="tree" aria-label={TEXT.tree} aria-describedby="ft-keys" onKeyDown={onKeyDown}>
            {!files && !error && <div className="subtle ft-note">{TEXT.loading}…</div>}
            {files && files.length === 0 && <div className="subtle ft-note">{TEXT.noFiles}</div>}
            {files && files.length > 0 && visible.length === 0 && <div className="subtle ft-note">{TEXT.noMatch(filter.trim())}</div>}
            {visible.map((r) => {
              const n = r.node;
              const pad = { paddingLeft: 8 + r.depth * 14 };
              const common = {
                "data-path": n.path,
                role: "treeitem",
                "aria-level": r.depth + 1,
                tabIndex: n.path === focusPath ? 0 : -1,
                onFocus: () => setFocused(n.path),
                onClick: () => { setFocused(n.path); activate(r); },
                style: pad,
              } as const;
              if (n.kind === "dir") {
                return (
                  <div key={`d:${n.path}`} {...common} aria-expanded={r.open} className="ft-row" title={n.start === n.path ? n.path : `${n.start} … ${n.path}`}>
                    {r.open ? <LuChevronDown size={14} aria-hidden="true" /> : <LuChevronRight size={14} aria-hidden="true" />}
                    {r.open ? <LuFolderOpen size={14} aria-hidden="true" /> : <LuFolder size={14} aria-hidden="true" />}
                    <span className="ft-name">{n.name}</span>
                    <span className="ft-count">{n.fileCount}</span>
                  </div>
                );
              }
              return (
                <div key={`f:${n.path}`} {...common} aria-selected={selected === n.path} className={`ft-row ft-file ${selected === n.path ? "active" : ""}`} title={n.path}>
                  <LuFileCode2 size={14} aria-hidden="true" />
                  <span className="ft-name mono">{n.name}</span>
                  {n.file.language && <span className="ft-lang">{n.file.language}</span>}
                </div>
              );
            })}
            {rows.length > MAX_ROWS && <div className="subtle ft-note">{TEXT.tooMany(MAX_ROWS)}</div>}
          </div>
          <div id="ft-keys" className="ft-keys subtle">{TEXT.keys}</div>
        </div>

        <div className="card" style={{ overflow: "hidden", minWidth: 0 }}>
          <div className="card-head ft-code-head">
            {selected ? (
              <nav aria-label={TEXT.breadcrumb} className="ft-crumbs">
                {crumbs.map((part, i) => {
                  const last = i === crumbs.length - 1;
                  const prefix = crumbs.slice(0, i + 1).join("/");
                  return (
                    <span key={prefix} className="ft-crumb">
                      {last ? <b className="mono" aria-current="page">{part}</b> : <button type="button" className="ft-crumb-btn mono" onClick={() => revealFolder(prefix)}>{part}</button>}
                      {!last && <LuChevronRight size={13} aria-hidden="true" />}
                    </span>
                  );
                })}
              </nav>
            ) : <span className="subtle">{TEXT.pickFile}</span>}
            {content && <span className="subtle" style={{ whiteSpace: "nowrap" }}>{TEXT.lines(content.lines.length)}</span>}
          </div>
          {loading && <Loading />}
          {content && !loading && <CodeView lines={content.lines} highlightFrom={line} highlightTo={line} inline />}
        </div>
      </div>
    </AppShell>
  );
}
