// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Doc = { id: number; filename: string; format: string; page_count: number | null; size_bytes: number; status: string; error: string | null; created_at: string };

const h = vi.hoisted(() => ({
  chunked: vi.fn(),
  del: vi.fn(),
  docs: [] as Doc[],
  reload: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("../components/AppShell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("../components/Tour", () => ({ usePageTour: () => {} }));
vi.mock("../components/Conversation", () => ({ ConversationBar: () => null, FollowUpNote: () => null }));
vi.mock("../components/Markdown", () => ({ Markdown: ({ text }: { text: string }) => <p>{text}</p> }));
vi.mock("../lib/auth", () => ({
  useAuth: () => ({ user: { role: "analyst", preferences: { welcome_seen: true } }, updatePreferences: () => Promise.resolve(), signinRole: "developer" }),
  SIGNIN_ROLES: [{ id: "developer", label: "Developer", hint: "" }],
}));
vi.mock("../lib/router", () => ({ navigate: h.navigate, Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => <a href={to} {...rest}>{children}</a> }));
vi.mock("../lib/hooks", () => ({
  useApi: (url: string) => (url === "/doc-qa/documents" ? { data: h.docs, reload: h.reload } : { data: [], loading: false, reload: () => {} }),
}));
vi.mock("../lib/chunkedUpload", async () => {
  const real = await vi.importActual<typeof import("../lib/chunkedUpload")>("../lib/chunkedUpload");
  return { ...real, uploadInChunks: h.chunked };
});
vi.mock("../lib/api", async () => {
  const real = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...real, api: { post: vi.fn(), get: () => Promise.resolve([]), del: h.del, upload: vi.fn() } };
});

import { uploadDocuments } from "../lib/docUpload";
import { DocQAPage } from "./DocQA";
import { ProjectsPage } from "./Projects";

const file = (name: string, size = 5) => new File([new Uint8Array(size)], name, { type: "application/octet-stream" });
const doc = (id: number, filename: string, status = "ready", extra: Partial<Doc> = {}): Doc =>
  ({ id, filename, format: filename.split(".").pop()!, page_count: 3, size_bytes: 2_500_000, status, error: null, created_at: "2026-11-04T10:00:00Z", ...extra });

// jsdom has no layout, so it does not implement scrollIntoView (the chat scrolls to the latest answer).
Element.prototype.scrollIntoView = function scrollIntoView() {};

beforeEach(() => { h.chunked.mockReset(); h.del.mockReset(); h.reload.mockReset(); h.navigate.mockReset(); h.docs = []; });
afterEach(cleanup);

describe("uploadDocuments", () => {
  it("sends supported files through the chunked uploader and reports the rest", async () => {
    h.chunked.mockImplementation((f: File) => (f.name === "bad.pdf" ? Promise.reject(new Error("Too large")) : Promise.resolve(doc(1, f.name, "processing"))));
    const r = await uploadDocuments([file("spec.pdf"), file("notes.md"), file("image.png"), file("bad.pdf")]);
    expect(h.chunked).toHaveBeenCalledTimes(3);
    expect(r.uploaded.map((d) => d.filename)).toEqual(["spec.pdf", "notes.md"]);
    expect(r.failed.map((f) => f.name)).toEqual(["image.png", "bad.pdf"]);
  });
});

describe("Applications page", () => {
  it("offers code and document upload in the New project dialog", () => {
    render(<ProjectsPage />);
    fireEvent.click(screen.getByRole("button", { name: /New project/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Source code")).toBeTruthy();
    expect(within(dialog).getByText(/Documents for Document Q&A/)).toBeTruthy();
  });

  it("uploads documents on their own from the Upload documents button", async () => {
    h.chunked.mockResolvedValue(doc(7, "spec.pdf", "processing"));
    render(<ProjectsPage />);
    fireEvent.click(screen.getByRole("button", { name: /Upload documents/ }));
    const input = document.querySelector<HTMLInputElement>('input[type=file][accept*=".pdf"]')!;
    fireEvent.change(input, { target: { files: [file("spec.pdf"), file("logo.png")] } });
    expect(screen.getByText(/Skipped \(unsupported type\): logo.png/)).toBeTruthy();
    await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Upload$/ })); });
    expect(h.chunked).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Document Q&A", () => {
  it("offers upload on the page itself when there are no documents", () => {
    render(<DocQAPage />);
    expect(screen.getByText("Upload a document to start")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Upload$/ })).toBeTruthy();
    expect(screen.getByTestId("doc-file-input").getAttribute("accept")).toContain(".pdf");
  });

  it("lists the inventory in a dropdown with delete on the right of each row", async () => {
    h.docs = [doc(3, "runbook.pdf"), doc(4, "spec.docx")];
    h.del.mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DocQAPage />);
    fireEvent.click(screen.getByRole("button", { name: /runbook.pdf/ }));
    const pop = screen.getByRole("dialog", { name: "Your documents" });
    expect(within(pop).getByText("spec.docx")).toBeTruthy();
    expect(within(pop).getAllByText(/3 pages · 2.4 MB · /)).toHaveLength(2); // pages, size and date on every row
    fireEvent.click(within(pop).getAllByRole("button", { name: /spec.docx/ }).find((b) => b.classList.contains("inv-pick"))!);
    expect(screen.getByText("Ask anything about spec.docx")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /spec.docx/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Delete runbook.pdf" })); });
    expect(h.del).toHaveBeenCalledWith("/doc-qa/documents/3");
    expect(h.reload).toHaveBeenCalled();
  });

  it("keeps the question box disabled while a document is still being indexed, and polls", () => {
    vi.useFakeTimers();
    h.docs = [doc(5, "manual.pdf", "processing")];
    render(<DocQAPage />);
    expect(screen.getByText("Reading and indexing manual.pdf…")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Your question" }) as HTMLTextAreaElement).disabled).toBe(true);
    act(() => vi.advanceTimersByTime(2100));
    expect(h.reload).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("explains a failed document", () => {
    h.docs = [doc(6, "scan.pdf", "failed", { error: "No readable text could be extracted from this document." })];
    render(<DocQAPage />);
    expect(screen.getByText("scan.pdf could not be read")).toBeTruthy();
    expect(screen.getByText(/No readable text could be extracted/)).toBeTruthy();
  });

  it("shows upload progress in the tray and selects the new document", async () => {
    h.docs = [doc(3, "runbook.pdf")];
    let finish: (d: Doc) => void = () => {};
    h.chunked.mockImplementation((_f: File, _t: unknown, opts: { onProgress: (p: unknown) => void }) => {
      opts.onProgress({ sent: 4_000_000, total: 10_000_000, chunksDone: 1, chunksTotal: 3 });
      return new Promise((r) => { finish = r; });
    });
    render(<DocQAPage />);
    await act(async () => { fireEvent.change(screen.getByTestId("doc-file-input"), { target: { files: [file("big.pdf", 10)] } }); });
    const tray = screen.getByRole("region", { name: "Uploads" });
    expect(within(tray).getByText(/Uploading 40%/)).toBeTruthy();
    expect(within(tray).getByText("Piece 2 of 3")).toBeTruthy();
    await act(async () => { finish(doc(9, "big.pdf", "processing")); });
    expect(within(tray).getByText("Reading and indexing")).toBeTruthy();
    expect(h.reload).toHaveBeenCalled();
  });

  it("rejects unsupported files in the tray without uploading them", async () => {
    render(<DocQAPage />);
    await act(async () => { fireEvent.change(screen.getByTestId("doc-file-input"), { target: { files: [file("photo.jpg")] } }); });
    expect(screen.getByText(/Unsupported file type/)).toBeTruthy();
    expect(h.chunked).not.toHaveBeenCalled();
  });
});
