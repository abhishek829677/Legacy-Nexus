import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuCheck, LuDatabase, LuFileText, LuFolder, LuFolderOpen, LuGitBranch, LuMessageSquareText, LuPlay, LuPlus, LuRefreshCw, LuSparkles, LuTrash2, LuUpload, LuX } from "react-icons/lu";
import { AppShell } from "../components/AppShell";
import { usePageTour } from "../components/Tour";
import { DASHBOARD_TOUR } from "../components/tours";
import { EmptyState, Loading, Modal, useToast } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtDate, fmtNumber, initials } from "../lib/format";
import { useApi } from "../lib/hooks";
import { canPickDirectory, filesFromDirectory, filesFromDrop, pickDirectory, type DirectoryHandle } from "../lib/dropFiles";
import { DOC_ACCEPT, DOC_TYPES_LABEL, fmtBytes, isDocFile, uploadDocuments, type DocUploadResult } from "../lib/docUpload";
import { navigate } from "../lib/router";
import type { Project } from "../lib/types";

export function ProjectsPage() {
  const { user, updatePreferences } = useAuth();
  const toast = useToast();
  const { data: projects, loading, reload } = useApi<Project[]>("/projects");
  const [creating, setCreating] = useState(false);
  const [importingRepo, setImportingRepo] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [busySample, setBusySample] = useState(false);
  const welcomed = Boolean(user?.preferences?.welcome_seen);
  const canWrite = user?.role === "admin" || user?.role === "analyst";
  usePageTour("dashboard", DASHBOARD_TOUR, welcomed && !loading);

  // poll while any project is analysing
  useEffect(() => {
    if (!projects?.some((p) => p.status === "analyzing")) return;
    const t = setTimeout(reload, 1500);
    return () => clearTimeout(t);
  }, [projects, reload]);

  const loadSample = async () => {
    setBusySample(true);
    try {
      const p = await api.post<Project>("/projects/sample");
      toast("Sample application loaded. Analysis is running.");
      navigate(`/projects/${p.id}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusySample(false);
    }
  };

  const remove = async (p: Project) => {
    if (!confirm(`Delete “${p.name}” and all of its analysis results? This cannot be undone.`)) return;
    try {
      await api.del(`/projects/${p.id}`);
      toast("Project deleted");
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <AppShell title="Projects">
      <div className="app-hero">
        <div className="app-hero-glow" aria-hidden="true" />
        <div className="app-hero-copy">
          <span className="app-hero-eyebrow">Workspace</span>
          <h1>Applications</h1>
          <p>Each project is one legacy application: its sources, its knowledge graph and everything derived from it.</p>
        </div>
        <div className="row-wrap app-hero-actions">
          {canWrite && (
            <button className="btn" onClick={loadSample} disabled={busySample} data-tour="load-sample">
              {busySample ? <span className="spinner" /> : <LuSparkles size={16} />} Load sample application
            </button>
          )}
          {canWrite && (
            <button className="btn" onClick={() => setImportingRepo(true)} data-tour="import-repo">
              <LuGitBranch size={16} /> Import from repository
            </button>
          )}
          <button className="btn" onClick={() => setUploadingDocs(true)} data-tour="upload-docs">
            <LuFileText size={16} /> Upload documents
          </button>
          {canWrite && (
            <button className="btn btn-hero-primary" onClick={() => setCreating(true)} data-tour="new-project">
              <LuPlus size={16} /> New project
            </button>
          )}
        </div>
      </div>

      <div className="card" data-tour="project-list">
        {loading && !projects ? (
          <Loading />
        ) : !projects?.length ? (
          <EmptyState icon={<LuDatabase size={36} />} title="No applications yet">
            {canWrite
              ? "Use the buttons above: load the sample banking system to explore, or create a project and upload your own code (COBOL, Java, .NET, Python, JavaScript and more)."
              : "No applications have been shared with you yet. Ask an analyst or administrator to add one."}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Application</th><th>Status</th><th className="num">Programs</th><th className="num">Business rules</th><th className="num">Lines of code</th><th>Analysed</th><th /></tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/projects/${p.id}`)}>
                    <td>
                      <div className="app-cell">
                        <span className={`app-ico tone-${p.id % 6}`} aria-hidden="true">{initials(p.name)}</span>
                        <div>
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                          {p.description && <div className="subtle" style={{ maxWidth: 520 }}>{p.description}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ minWidth: 200 }}><StatusCell p={p} /></td>
                    <td className="num">{fmtNumber(p.stats.programs_analysed)}</td>
                    <td className="num">{fmtNumber(p.stats.business_rules)}</td>
                    <td className="num">{fmtNumber(p.stats.lines_of_code)}</td>
                    <td className="subtle">{fmtDate(p.analyzed_at)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {canWrite && (
                        <button className="btn btn-ghost btn-icon btn-sm btn-danger" title="Delete project" aria-label={`Delete ${p.name}`} onClick={() => remove(p)}>
                          <LuTrash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && <NewProjectModal onClose={() => setCreating(false)} onCreated={(id) => navigate(`/projects/${id}`)} />}
      {importingRepo && <ImportRepoModal onClose={() => setImportingRepo(false)} onCreated={(id) => navigate(`/projects/${id}`)} />}
      {uploadingDocs && <UploadDocumentsModal onClose={() => setUploadingDocs(false)} />}
      {user && !welcomed && canWrite && <WelcomeModal onClose={() => updatePreferences({ welcome_seen: true }).catch(() => {})} onSample={async () => {
        await updatePreferences({ welcome_seen: true }).catch(() => {});
        loadSample();
      }} />}
    </AppShell>
  );
}

export function StatusCell({ p }: { p: Project }) {
  if (p.status === "analyzing")
    return (
      <div className="stack-sm" style={{ gap: 4 }}>
        <span className="tag tag-amber"><span className="spinner" style={{ width: 10, height: 10 }} /> Analysing · {p.progress}%</span>
        <div className="progress"><span style={{ width: `${p.progress}%` }} /></div>
        <span className="subtle">{p.stage}</span>
      </div>
    );
  if (p.status === "ready") return <span className="tag tag-green">Ready</span>;
  if (p.status === "failed") return <span className="tag tag-red" title={p.error ?? ""}>Failed</span>;
  if (p.status === "uploaded") return <span className="tag tag-blue">Uploaded · not analysed</span>;
  return <span className="tag">Empty</span>;
}

function WelcomeModal({ onClose, onSample }: { onClose: () => void; onSample: () => void }) {
  return (
    <Modal title="Welcome to LegacyNexus" onClose={onClose} width={600}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Show me around</button>
        <button className="btn btn-signal" onClick={onSample}><LuPlay size={15} /> Start with the sample</button>
      </>}>
      <p className="muted">Here is how to get from a pile of legacy code to answers in four steps.</p>
      <div className="steps">
        {[
          ["Create a project", "One project per application. Load the sample, or upload COBOL, JCL, SQL, Java, C#, Python, JavaScript/TypeScript, shell scripts, YAML config, OpenAPI specs and notes (files or .zip)."],
          ["Run the analysis", "Real parsers build the Legacy Knowledge Graph: programs, calls, SQL, files, jobs, rules and data lineage. No AI tokens are used."],
          ["Explore the results", "Use the buttons on the project page: dependency graph, impact analysis, business rules, data lineage, documentation and modernization plan."],
          ["Ask questions", "Pick an AI model and enter its key in Settings, then ask in plain language. Answers come with verified line citations and a confidence score."],
        ].map(([t, d], i) => (
          <div className="step" key={t}>
            <span className="n">{i + 1}</span>
            <div><b>{t}</b><span>{d}</span></div>
          </div>
        ))}
      </div>
      <p className="subtle" style={{ marginTop: 16 }}>Each page has its own short guide. Open it again with the Guide button in the top bar.</p>
    </Modal>
  );
}

function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [docs, setDocs] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
  }, []);

  // Upload progress, in bytes of file content sent so far (null = not started).
  const [sent, setSent] = useState<number | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "done" | "failed">("idle");

  const resetUpload = () => { setSent(null); setUploadState("idle"); };

  // Loader screen while the browser lists picked files or we walk a dropped folder (both can take seconds).
  const [loading, setLoading] = useState<{ title: string; found?: number } | null>(null);
  const reading = loading !== null;
  const pickerOpen = useRef(false);

  const add = (list: FileList | File[] | null) => {
    if (!list || !list.length || busy) return;
    // Copy now: a FileList is live and empties when the input is reset, before the state update runs.
    const picked = Array.from(list);
    resetUpload();
    setFiles((prev) => [...prev, ...picked]);
  };
  const openPicker = (input: HTMLInputElement | null) => {
    if (!input || busy || reading) return;
    // Only the plain folder input (browsers without showDirectoryPicker) can take long enough to need the
    // loader. Picked files arrive at once, and guessing from window focus left the loader up when a file
    // dialog was cancelled without the browser sending "cancel".
    pickerOpen.current = input === folderInput.current;
    input.click();
  };
  const onPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    pickerOpen.current = false;
    add(e.target.files);
    e.target.value = ""; // so the same folder can be picked again
    setLoading(null); // same render as the new list, so the loader stays until the files show
  };
  // Folder button: where the browser allows it we read the folder ourselves, so the loader can count files
  // as they are found. Otherwise use the plain folder input (no count until the browser has listed it all).
  const pickFolder = async () => {
    if (busy || reading) return;
    if (!canPickDirectory()) return openPicker(folderInput.current);
    let dir: DirectoryHandle | null;
    try {
      dir = await pickDirectory();
    } catch {
      setError("The browser does not allow opening that folder (it may be a system folder). Choose a subfolder, or drag the folder in.");
      return;
    }
    if (!dir) return; // picker closed
    const title = "Reading the selected folder…";
    setLoading({ title, found: 0 });
    try {
      add(await filesFromDirectory(dir, (found) => setLoading({ title, found })));
    } finally {
      setLoading(null);
    }
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (busy || reading) return;
    setLoading({ title: "Reading the dropped files…", found: 0 });
    filesFromDrop(e.dataTransfer, (found) => setLoading({ title: "Reading the dropped files…", found }))
      .then(add)
      .finally(() => setLoading(null));
  };

  // The page gets focus back when the file dialog closes; from then until "change" (files listed) or
  // "cancel" (dialog dismissed) the browser is still reading the selection, so show the loader.
  useEffect(() => {
    const onFocus = () => { if (pickerOpen.current) setLoading({ title: "Loading the selected files…" }); };
    const onCancel = () => { pickerOpen.current = false; setLoading(null); };
    const inputs = [fileInput.current, folderInput.current];
    window.addEventListener("focus", onFocus);
    inputs.forEach((i) => i?.addEventListener("cancel", onCancel));
    return () => {
      window.removeEventListener("focus", onFocus);
      inputs.forEach((i) => i?.removeEventListener("cancel", onCancel));
    };
  }, []);
  const removeFiles = (idx: number[]) => {
    const drop = new Set(idx);
    resetUpload();
    setFiles((prev) => prev.filter((_, j) => !drop.has(j)));
  };

  // After the bytes are sent the server still unpacks and checks every file, then the analysis is started and
  // documents are uploaded; this loader shows those steps so the page does not look stuck.
  const [step, setStep] = useState<FinishStep | null>(null);
  const [stepStarted, setStepStarted] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!step) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [step]);
  // The timer counts per visible step, so moving between parts of the same step does not restart it.
  const goTo = (s: FinishStep | null) => {
    setStep((prev) => {
      if (!prev || !s || STEP_INDEX[prev] !== STEP_INDEX[s]) setStepStarted(Date.now());
      return s;
    });
  };

  const submit = async () => {
    if (!name.trim()) return setError("Give the application a name.");
    if (!files.length) return setError("Add at least one source file or a .zip archive.");
    setBusy(true);
    setError(null);
    try {
      const p = await api.post<Project>("/projects", { name, description });
      const form = new FormData();
      files.forEach((f) => form.append("files", f, filePath(f)));
      setSent(0);
      setUploadState("uploading");
      try {
        // Parts go out in order, so bytes sent map onto the files one after another.
        let storing = false;
        const sentAll = () => { if (!storing) { storing = true; setSent(size); goTo("store"); } }; // the server is working now
        await api.uploadWithProgress(`/projects/${p.id}/files`, form, (loaded, total) => {
          setSent((loaded / Math.max(1, total)) * size);
          if (loaded >= total) sentAll();
        }, sentAll);
      } catch (e) {
        setUploadState("failed");
        throw e;
      }
      setUploadState("done");
      goTo("analyze");
      await api.post(`/projects/${p.id}/analyze`);
      // Documents go to Document Q&A; a failure here must not undo the project that was just created.
      if (docs.length) goTo("docs");
      const docResult = docs.length ? await uploadDocuments(docs) : null;
      goTo("open");
      toast(docResult?.uploaded.length
        ? `Code uploaded and analysis is running. ${docSummary(docResult)}`
        : "Upload complete. Analysis is running.");
      if (docResult?.failed.length) toast(docFailures(docResult), true);
      onCreated(p.id);
    } catch (e) {
      goTo(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const size = files.reduce((a, f) => a + f.size, 0);

  // Where each file starts in the upload, and how far along it is (0-100).
  const progress = (() => {
    let start = 0;
    return files.map((f) => {
      const from = start;
      start += f.size;
      if (uploadState === "done" || uploadState === "failed") return 100;
      if (sent === null) return 0;
      if (f.size === 0) return sent >= from ? 100 : 0;
      return Math.max(0, Math.min(100, ((sent - from) / f.size) * 100));
    });
  })();

  // One row per picked folder, one row per single file. A folder's bar is the share of its bytes sent.
  type Entry = { key: string; kind: "file" | "folder"; name: string; idx: number[] };
  const entries: Entry[] = [];
  const folderRows = new Map<string, Entry>();
  files.forEach((f, i) => {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || "";
    const top = rel.includes("/") ? rel.split("/")[0] : "";
    if (!top) {
      entries.push({ key: `file-${i}-${f.name}`, kind: "file", name: f.name, idx: [i] });
      return;
    }
    let row = folderRows.get(top);
    if (!row) {
      row = { key: `folder-${top}`, kind: "folder", name: top, idx: [] };
      folderRows.set(top, row);
      entries.push(row);
    }
    row.idx.push(i);
  });
  const entryBytes = (e: Entry) => e.idx.reduce((a, i) => a + files[i].size, 0);
  const entryPct = (e: Entry) => {
    const bytes = entryBytes(e);
    if (!bytes) return e.idx.reduce((a, i) => a + progress[i], 0) / e.idx.length;
    return e.idx.reduce((a, i) => a + (progress[i] / 100) * files[i].size, 0) / bytes * 100;
  };

  return (
    <Modal title="New project" onClose={onClose} width={620}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy || reading}>
          {busy ? <span className="spinner" /> : <LuPlay size={15} />} Upload and analyse
        </button>
      </>}>
      {loading && createPortal(
        <div className="file-loader" role="status" aria-live="polite">
          <div className="file-loader-card">
            <span className="spinner file-loader-spinner" aria-hidden="true" />
            <div className="file-loader-title">{loading.title}</div>
            <div className="file-loader-sub">
              {loading.found !== undefined ? `${fmtNumber(loading.found)} files found so far` : "Large folders can take a few seconds."}
            </div>
          </div>
        </div>,
        document.body,
      )}
      {step && createPortal(
        <FinishLoader step={step} seconds={Math.floor((Date.now() - stepStarted) / 1000)} />,
        document.body,
      )}
      <div className="stack">
        <div className="field">
          <label htmlFor="pname">Application name</label>
          <input id="pname" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Retail Banking Core" autoFocus />
        </div>
        <div className="field">
          <label htmlFor="pdesc">Description (optional)</label>
          <input id="pdesc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this application does, who owns it" />
        </div>
        <div className="label" style={{ marginBottom: -6 }}>Source code</div>
        <div
          className={`dropzone ${over ? "over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          onClick={() => openPicker(fileInput.current)}
          role="button" tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && openPicker(fileInput.current)}
          aria-busy={reading}
        >
          <LuUpload size={28} color="var(--text-3)" />
          <div style={{ fontWeight: 500, marginTop: 8 }}>Drop source files, folders or a .zip here, or click to browse</div>
          <div className="hint" style={{ marginTop: 4 }}>.cbl .cob .cpy .jcl .sql .ddl .yaml .json .md .txt · extension-less mainframe members are detected by content</div>
          <input ref={fileInput} type="file" multiple hidden onClick={(e) => e.stopPropagation()} onChange={onPicked} />
        </div>
        <div className="row">
          <button className="btn btn-sm" type="button" onClick={pickFolder}><LuFolderOpen size={14} /> Add a whole folder</button>
          <input ref={folderInput} type="file" multiple hidden onChange={onPicked} />
          {files.length > 0 && (
            <>
              <div className="spacer" />
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { resetUpload(); setFiles([]); }}><LuRefreshCw size={14} /> Clear</button>
            </>
          )}
        </div>
        {files.length > 0 && (
          <ul className="upload-list" aria-label="Files to upload">
            {entries.map((e) => {
              const pct = Math.min(100, entryPct(e));
              const state = uploadState === "failed" ? "failed" : pct >= 100 && uploadState !== "idle" ? "done" : "";
              const label = state === "failed" ? "Failed" : state === "done" ? "Uploaded" : `${Math.floor(pct)}%`;
              const folder = e.kind === "folder";
              return (
                <li key={e.key} className="upload-item">
                  <div className="upload-head">
                    {folder
                      ? <LuFolder size={14} aria-hidden="true" className="upload-icon" />
                      : <LuFileText size={14} aria-hidden="true" className="upload-icon" />}
                    <span className="upload-name" title={e.name}>{e.name}</span>
                    <span className="upload-size">
                      {folder ? `${plural(e.idx.length, "file", "files")} · ` : ""}{fmtBytes(entryBytes(e))}
                    </span>
                    {!busy && uploadState !== "done" && (
                      <button type="button" className="btn btn-ghost btn-icon btn-sm upload-remove"
                        aria-label={`Remove ${folder ? "folder " : ""}${e.name}`} onClick={() => removeFiles(e.idx)}>
                        <LuX size={12} />
                      </button>
                    )}
                  </div>
                  {/* Bars only once the upload has started; before that the list is just what will be sent. */}
                  {uploadState !== "idle" && (
                    <div className={`upload-bar ${state}`} role="progressbar" aria-label={`${e.name}: ${label}`}
                      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(pct)}>
                      <span className="upload-label">{label}</span>
                      <span className="upload-fill" style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }} aria-hidden="true">
                        <span className="upload-label">{label}</span>
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="field" style={{ marginTop: 4 }}>
          <div className="label">Documents for Document Q&amp;A <span className="subtle" style={{ fontWeight: 400 }}>(optional)</span></div>
          <span className="hint" style={{ marginTop: 0, marginBottom: 6 }}>Specifications, runbooks or manuals. You can ask questions about them in Document Q&amp;A.</span>
          <DocDropzone files={docs} onChange={setDocs} compact />
        </div>
        {error && <div className="error-box">{error}</div>}
      </div>
    </Modal>
  );
}

type FinishStep = "store" | "analyze" | "docs" | "open";
const FINISH_STEPS = ["Files uploaded", "Checking and storing the files", "Opening the project for analysis"];
// Three visible steps. Queuing the analysis (instant) and uploading documents happen during the second one.
const STEP_INDEX: Record<FinishStep, number> = { store: 1, analyze: 1, docs: 1, open: 2 };
const STEP_TITLE: Record<FinishStep, string> = {
  store: "Checking and storing the files", analyze: "Checking and storing the files",
  docs: "Uploading documents for Document Q&A", open: "Opening the project for analysis",
};

/** Loader shown from the end of the upload until the project page opens. */
function FinishLoader({ step, seconds }: { step: FinishStep; seconds: number }) {
  const current = STEP_INDEX[step];
  return (
    <div className="file-loader" role="status" aria-live="polite">
      <div className="file-loader-card finish-card">
        <span className="spinner file-loader-spinner" aria-hidden="true" />
        <div className="file-loader-title">{STEP_TITLE[step]}…</div>
        <ol className="finish-steps">
          {FINISH_STEPS.map((label, i) => (
            <li key={label} className={i < current ? "done" : i === current ? "now" : ""}>
              <span className="finish-mark" aria-hidden="true">{i < current ? <LuCheck size={12} /> : null}</span>
              {label}
            </li>
          ))}
        </ol>
        <div className="file-loader-sub">
          {current === 1 && step !== "docs" && seconds >= 3
            ? `${seconds} s so far. Large uploads and .zip files take longer: every file is unpacked and checked.`
            : seconds >= 3 ? `${seconds} s so far…`
            : "The analysis itself runs next, on the project page, where you can follow its progress."}
        </div>
      </div>
    </div>
  );
}

/** A file's path inside a picked folder, or just its name. */
const filePath = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;

/** Create a project by cloning a public git repository URL. */
function ImportRepoModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [branch, setBranch] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suggest a project name from the repository name until the user types their own.
  const [nameTouched, setNameTouched] = useState(false);
  const onUrlChange = (value: string) => {
    setUrl(value);
    setBranches([]);
    setDefaultBranch(null);
    if (!nameTouched) {
      const repo = value.trim().replace(/\.git$/i, "").replace(/\/+$/, "").split("/").pop() || "";
      setName(repo);
    }
  };

  const loadBranches = async () => {
    if (!url.trim()) return setError("Enter a repository URL first.");
    setLoadingBranches(true);
    setError(null);
    try {
      const r = await api.post<{ default: string | null; branches: string[] }>("/projects/repo-branches", { url: url.trim() });
      setBranches(r.branches);
      setDefaultBranch(r.default);
      if (r.default) setBranch(r.default);
      else if (r.branches.length) setBranch(r.branches[0]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingBranches(false);
    }
  };

  const submit = async () => {
    if (!url.trim()) return setError("Enter a repository URL.");
    if (!name.trim()) return setError("Give the application a name.");
    setBusy(true);
    setError(null);
    try {
      const p = await api.post<Project & { imported_files: number; skipped_files: number }>("/projects/from-repo", {
        name, description, url: url.trim(), branch: branch.trim() || null,
      });
      const n = p.imported_files ?? 0;
      if (n <= 1) {
        toast(`Only ${n} source file(s) were imported from this branch — the code is likely on a different branch. Set the branch above and try again.`, true);
      } else {
        toast(`Imported ${n} source file(s). Analysis is running.`);
      }
      onCreated(p.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Import from repository" onClose={onClose} width={620}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? <span className="spinner" /> : <LuGitBranch size={15} />} Clone and analyse
        </button>
      </>}>
      <div className="stack">
        <p className="muted" style={{ marginTop: -4 }}>
          Clone a public git repository over http(s). LegacyNexus keeps the analysable source files
          (COBOL, JCL, SQL, Java, C#, Python, JavaScript/TypeScript and more) and runs the analysis.
        </p>
        <div className="field">
          <label htmlFor="repo-url">Repository URL</label>
          <div className="row" style={{ gap: 8 }}>
            <input id="repo-url" className="input" style={{ flex: 1 }} value={url} onChange={(e) => onUrlChange(e.target.value)}
              placeholder="https://github.com/owner/repo.git" autoFocus
              onKeyDown={(e) => e.key === "Enter" && !busy && submit()} />
            <button className="btn btn-sm" type="button" onClick={loadBranches} disabled={loadingBranches || !url.trim()}>
              {loadingBranches ? <span className="spinner" /> : <LuGitBranch size={14} />} Load branches
            </button>
          </div>
        </div>
        <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
          <div className="field" style={{ flex: 2 }}>
            <label htmlFor="repo-name">Application name</label>
            <input id="repo-name" className="input" value={name}
              onChange={(e) => { setName(e.target.value); setNameTouched(true); }} placeholder="e.g. Retail Banking Core" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="repo-branch">Branch / tag <span className="subtle" style={{ fontWeight: 400 }}>(optional)</span></label>
            {branches.length > 0 ? (
              <select id="repo-branch" className="input" value={branch} onChange={(e) => setBranch(e.target.value)}>
                {branches.map((b) => (
                  <option key={b} value={b}>{b}{b === defaultBranch ? " (default)" : ""}</option>
                ))}
              </select>
            ) : (
              <input id="repo-branch" className="input" value={branch}
                onChange={(e) => setBranch(e.target.value)} placeholder="default branch" />
            )}
            <span className="hint" style={{ marginTop: 4 }}>
              {branches.length > 0
                ? "Pick the branch that holds the code — the default branch may be nearly empty."
                : "Click “Load branches”, or type a branch (e.g. develop) if the code isn't on the default branch."}
            </span>
          </div>
        </div>
        <div className="field">
          <label htmlFor="repo-desc">Description (optional)</label>
          <input id="repo-desc" className="input" value={description}
            onChange={(e) => setDescription(e.target.value)} placeholder="What this application does, who owns it" />
        </div>
        <p className="subtle" style={{ marginTop: -4 }}>
          Only public repositories can be imported; a URL that needs credentials will be rejected.
        </p>
        {error && <div className="error-box">{error}</div>}
      </div>
    </Modal>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const docSummary = (r: DocUploadResult) => `${plural(r.uploaded.length, "document", "documents")} added to Document Q&A.`;
const docFailures = (r: DocUploadResult) =>
  `${plural(r.failed.length, "document was", "documents were")} not uploaded: ${r.failed.map((f) => `${f.name} (${f.message})`).join("; ")}`;

/** Drop area for Document Q&A files, with a removable list of what was picked. */
function DocDropzone({ files, onChange, compact }: { files: File[]; onChange: (f: File[]) => void; compact?: boolean }) {
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const add = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list);
    setRejected(picked.filter((f) => !isDocFile(f.name)).map((f) => f.name));
    const ok = picked.filter((f) => isDocFile(f.name) && !files.some((x) => x.name === f.name && x.size === f.size));
    onChange([...files, ...ok]);
  };
  return (
    <div className="stack-sm">
      <div
        className={`dropzone ${over ? "over" : ""}`}
        style={compact ? { padding: 18 } : undefined}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
        role="button" tabIndex={0} aria-label="Add documents"
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
      >
        <LuFileText size={compact ? 22 : 28} color="var(--text-3)" />
        <div style={{ fontWeight: 500, marginTop: 6 }}>Drop documents here, or click to browse</div>
        <div className="hint" style={{ marginTop: 4 }}>{DOC_TYPES_LABEL}</div>
        <input ref={input} type="file" multiple accept={DOC_ACCEPT} hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>
      {rejected.length > 0 && <div className="warn-box" style={{ fontSize: 13 }}>Skipped (unsupported type): {rejected.join(", ")}</div>}
      {files.length > 0 && (
        <div className="row-wrap" style={{ gap: 6 }}>
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="tag" style={{ height: 28 }}>
              <LuFileText size={13} aria-hidden="true" /> {f.name}
              <button type="button" className="btn btn-ghost btn-icon btn-sm" style={{ width: 22, height: 22 }} aria-label={`Remove ${f.name}`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}><LuX size={12} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Upload documents for Document Q&A without creating a project. */
function UploadDocumentsModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [docs, setDocs] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DocUploadResult | null>(null);

  const submit = async () => {
    if (!docs.length) return;
    setBusy(true);
    try {
      const r = await uploadDocuments(docs);
      setResult(r);
      if (r.uploaded.length) toast(docSummary(r));
      if (!r.failed.length) onClose();
      else setDocs(docs.filter((d) => r.failed.some((f) => f.name === d.name)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Upload documents" onClose={onClose} width={560}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        <button className="btn" onClick={() => navigate("/doc-qa")}><LuMessageSquareText size={15} /> Go to Document Q&amp;A</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy || !docs.length}>
          {busy ? <span className="spinner" /> : <LuUpload size={15} />} Upload
        </button>
      </>}>
      <p className="muted" style={{ marginBottom: 14 }}>Add specifications, runbooks or manuals, then ask questions about them in Document Q&amp;A.</p>
      <DocDropzone files={docs} onChange={setDocs} />
      {result && result.failed.length > 0 && <div className="error-box" style={{ marginTop: 12 }}>{docFailures(result)}</div>}
    </Modal>
  );
}
