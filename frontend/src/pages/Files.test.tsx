// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ path: null as string | null, navigate: vi.fn() }));
const FILES = [
  { path: "cobol/ACCOUNT.CBL", language: "cobol", size_bytes: 1, line_count: 3 },
  { path: "cobol/CUSTOMER.CBL", language: "cobol", size_bytes: 1, line_count: 3 },
  { path: "ws/app/src/com/acme/Main.java", language: "java", size_bytes: 1, line_count: 3 },
  { path: "README.md", language: null, size_bytes: 1, line_count: 1 },
];

vi.mock("../components/AppShell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("../components/ProjectContext", () => ({ useProject: () => ({ project: { id: 1 } }) }));
vi.mock("../lib/hooks", () => ({
  useApi: (url: string | null) =>
    url === "/projects/1/files" ? { data: FILES, error: null, loading: false } : url ? { data: { lines: ["LINE 1", "LINE 2"] }, error: null, loading: false } : { data: null, error: null, loading: false },
}));
vi.mock("../lib/router", () => ({
  navigate: state.navigate,
  useSearchParam: (name: string) => (name === "path" ? state.path : null),
}));

import { FilesPage } from "./Files";

beforeEach(() => {
  state.path = null;
  state.navigate.mockReset();
});
afterEach(cleanup);

const tree = () => screen.getByRole("tree");
const item = (name: string) => {
  const hit = within(tree()).getAllByRole("treeitem").find((el) => el.querySelector(".ft-name")?.textContent === name);
  if (!hit) throw new Error(`No tree row named ${name}`);
  return hit;
};

describe("Files explorer", () => {
  it("shows folders as a tree with file counts, compacting single-folder chains", () => {
    state.path = "README.md";
    render(<FilesPage />);
    expect(item("cobol").getAttribute("aria-expanded")).toBe("false");
    expect(within(item("cobol")).getByText("2")).toBeTruthy();
    expect(item("ws/app/src/com/acme")).toBeTruthy(); // one row for the whole chain
    expect(screen.queryByText("ACCOUNT.CBL")).toBeNull();
  });

  it("reveals and selects the open file", () => {
    state.path = "ws/app/src/com/acme/Main.java";
    render(<FilesPage />);
    expect(item("ws/app/src/com/acme").getAttribute("aria-expanded")).toBe("true");
    expect(item("Main.java").getAttribute("aria-selected")).toBe("true");
  });

  it("opens and closes folders by click and keyboard", () => {
    state.path = "README.md";
    render(<FilesPage />);
    fireEvent.click(item("cobol"));
    expect(screen.getByText("ACCOUNT.CBL")).toBeTruthy();
    fireEvent.keyDown(tree(), { key: "ArrowLeft" }); // focus is on cobol: closes it
    expect(screen.queryByText("ACCOUNT.CBL")).toBeNull();
    fireEvent.keyDown(tree(), { key: "ArrowRight" });
    expect(screen.getByText("ACCOUNT.CBL")).toBeTruthy();
    fireEvent.keyDown(tree(), { key: "ArrowDown" }); // first child
    fireEvent.keyDown(tree(), { key: "Enter" });
    expect(state.navigate).toHaveBeenLastCalledWith("/projects/1/files?path=cobol%2FACCOUNT.CBL");
  });

  it("filters while keeping parent folders visible", () => {
    state.path = "README.md";
    render(<FilesPage />);
    fireEvent.change(screen.getByRole("textbox", { name: "Filter files and folders" }), { target: { value: "customer" } });
    expect(item("cobol").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("CUSTOMER.CBL")).toBeTruthy();
    expect(screen.queryByText("ACCOUNT.CBL")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Filter files and folders" }), { target: { value: "zzz" } });
    expect(screen.getByText("No files match “zzz”.")).toBeTruthy();
  });

  it("shows a clickable breadcrumb that reveals the folder", () => {
    state.path = "cobol/CUSTOMER.CBL";
    render(<FilesPage />);
    const crumbs = screen.getByRole("navigation", { name: "File location" });
    expect(within(crumbs).getByText("CUSTOMER.CBL").getAttribute("aria-current")).toBe("page");
    fireEvent.click(item("cobol")); // close it
    expect(screen.queryByText("ACCOUNT.CBL")).toBeNull();
    fireEvent.click(within(crumbs).getByRole("button", { name: "cobol" }));
    expect(screen.getByText("ACCOUNT.CBL")).toBeTruthy();
  });

  it("opens the first file when none is chosen", () => {
    render(<FilesPage />);
    expect(state.navigate).toHaveBeenCalledWith("/projects/1/files?path=cobol%2FACCOUNT.CBL", true);
  });
});
