// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/AppShell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("../components/Tour", () => ({ usePageTour: () => {} }));
vi.mock("../lib/auth", () => ({
  useAuth: () => ({ user: { role: "analyst", preferences: { welcome_seen: true } }, updatePreferences: () => Promise.resolve() }),
}));
vi.mock("../lib/router", () => ({ navigate: vi.fn(), Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a> }));
vi.mock("../lib/hooks", () => ({ useApi: () => ({ data: [], loading: false, reload: () => {} }) }));

import { ProjectsPage } from "./Projects";

const file = (name: string, size = 5, folderPath?: string) => {
  const f = new File([new Uint8Array(size)], name);
  if (folderPath) Object.defineProperty(f, "webkitRelativePath", { value: folderPath });
  return f;
};

const openModal = () => {
  render(<ProjectsPage />);
  fireEvent.click(screen.getByRole("button", { name: /New project/ }));
  const dialog = screen.getByRole("dialog");
  const [codeInput, folderInput] = Array.from(dialog.querySelectorAll<HTMLInputElement>('input[type=file]:not([accept])'));
  return { dialog, codeInput, folderInput };
};

afterEach(cleanup);

describe("New project: source file list", () => {
  it("removes a single file with its × button", () => {
    const { dialog, codeInput } = openModal();
    fireEvent.change(codeInput, { target: { files: [file("A.CBL"), file("B.CBL")] } });
    const list = within(dialog).getByRole("list", { name: "Files to upload" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);

    fireEvent.click(within(list).getByRole("button", { name: "Remove A.CBL" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).queryByText("A.CBL")).toBeNull();
    expect(within(list).getByText("B.CBL")).toBeTruthy();
  });

  it("shows a picked folder as one row and removes the whole folder", () => {
    const { dialog, codeInput, folderInput } = openModal();
    fireEvent.change(folderInput, { target: { files: [file("A.CBL", 5, "core/A.CBL"), file("B.CPY", 5, "core/cpy/B.CPY")] } });
    fireEvent.change(codeInput, { target: { files: [file("NOTES.md")] } });
    const list = within(dialog).getByRole("list", { name: "Files to upload" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText(/2 files/)).toBeTruthy();

    fireEvent.click(within(list).getByRole("button", { name: "Remove folder core" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByText("NOTES.md")).toBeTruthy();
  });

  it("does not leave a loader up when the file dialog is closed without choosing", () => {
    const { dialog } = openModal();
    fireEvent.click(within(dialog).getByText(/Drop source files, folders or a .zip here/));
    // The page gets focus back when the dialog closes; no files and no "cancel" event follow.
    fireEvent.focus(window);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not show progress bars before the upload starts", () => {
    const { dialog, codeInput } = openModal();
    fireEvent.change(codeInput, { target: { files: [file("A.CBL")] } });
    expect(within(dialog).queryByRole("progressbar")).toBeNull();
  });
});
