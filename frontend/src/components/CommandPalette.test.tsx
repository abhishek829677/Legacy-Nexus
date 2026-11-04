// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LuGitFork, LuRadar } from "react-icons/lu";

const h = vi.hoisted(() => ({ navigate: vi.fn(), logout: vi.fn() }));
vi.mock("../lib/router", () => ({ navigate: h.navigate }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ logout: h.logout }) }));
vi.mock("../lib/api", () => ({ api: { get: () => Promise.resolve([{ id: 1, name: "Core Banking", status: "ready" }, { id: 2, name: "aws", status: "ready" }]) } }));

import { CommandPalette, matchScore } from "./CommandPalette";
import { CountUp } from "./Motion";

const PAGES = [{ path: "graph", label: "Dependency map", icon: LuGitFork }, { path: "impact", label: "Impact analysis", icon: LuRadar }];

beforeEach(() => { h.navigate.mockReset(); });
afterEach(cleanup);

describe("matchScore", () => {
  it("ranks prefix > word start > substring > letters in order", () => {
    expect(matchScore("dep", "Dependency map")).toBe(4);
    expect(matchScore("map", "Dependency map")).toBe(3);
    expect(matchScore("ndency", "Dependency map")).toBe(2);
    expect(matchScore("dmap", "Dependency map")).toBe(1);
    expect(matchScore("xyz", "Dependency map")).toBe(0);
    expect(matchScore("", "anything")).toBe(1);
  });
});

describe("CommandPalette", () => {
  const open = async () => {
    render(<CommandPalette pages={PAGES} projectId={1} onToggleMenu={() => {}} />);
    await act(async () => { fireEvent.keyDown(window, { key: "k", ctrlKey: true }); });
    return screen.getByRole("combobox");
  };

  it("opens with Ctrl+K and lists pages, other applications and actions", async () => {
    await open();
    expect(screen.getByRole("dialog", { name: "Quick search" })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Dependency map/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /aws/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Core Banking/ })).toBeNull(); // the current application is not repeated
    expect(screen.getByRole("option", { name: /Sign out/ })).toBeTruthy();
  });

  it("filters as you type and opens the highlighted result with Enter", async () => {
    const input = await open();
    fireEvent.change(input, { target: { value: "impact" } });
    expect(screen.getAllByRole("option")[0].textContent).toContain("Impact analysis");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(h.navigate).toHaveBeenCalledWith("/projects/1/impact");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("moves with the arrow keys and closes with Escape", async () => {
    const input = await open();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says when nothing matches", async () => {
    const input = await open();
    fireEvent.change(input, { target: { value: "zzzz" } });
    expect(screen.getByText("No matches for “zzzz”.")).toBeTruthy();
  });
});

describe("CountUp", () => {
  it("always gives screen readers the final value, and shows a dash when missing", () => {
    render(<><CountUp value={1177} /><span data-testid="none"><CountUp value={undefined} /></span></>);
    expect(document.querySelector(".mx-sr")!.textContent).toBe("1,177");
    expect(screen.getByTestId("none").textContent).toBe("—");
  });
});
