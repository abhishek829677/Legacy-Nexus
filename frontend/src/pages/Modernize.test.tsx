// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PLAN from "./__fixtures__/plan-sample.json"; // real POST /modernization response, project 1, java/postgresql/azure

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("../components/AppShell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("../components/ProjectContext", () => ({ useProject: () => ({ project: { id: 1 }, openSource: () => {} }) }));
vi.mock("../lib/api", () => ({ api: { post }, download: vi.fn(() => Promise.resolve()), qs: () => "" }));

import { ModernizePage } from "./Modernize";

const STALE = "Your selections have changed. Generate the plan again to update your results.";

beforeEach(() => post.mockReset());
afterEach(cleanup);

async function generated() {
  post.mockResolvedValueOnce(PLAN);
  render(<ModernizePage />);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /Generate plan/ })));
  await screen.findByTestId("readiness-panel");
}

describe("page structure and states", () => {
  it("shows the five steps and an empty state before a plan exists", () => {
    render(<ModernizePage />);
    for (const t of ["Choose your target stack", "Review the modernization plan", "Explore the analysis and recommendations", "Plan the migration", "Verify results"]) {
      expect(screen.getByRole("heading", { name: new RegExp(t) })).toBeTruthy();
    }
    expect(screen.getAllByText("Generate the plan to see this section.")).toHaveLength(4);
    expect(screen.getByText(/Pick the targets and press Generate plan/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "How this page works" })).toBeTruthy();
  });

  it("shows a loading state while the plan is generated", async () => {
    post.mockReturnValueOnce(new Promise(() => {}));
    render(<ModernizePage />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Generate plan/ })));
    expect(screen.getByText(/Generating the plan/)).toBeTruthy();
  });

  it("shows a human error with a next step, and no numbers", async () => {
    post.mockRejectedValueOnce(new Error("Analysis results missing (rules); run the analysis again"));
    render(<ModernizePage />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Generate plan/ })));
    const err = await screen.findByText(/The plan could not be generated/);
    expect(err.textContent).toContain("Analysis results missing (rules)");
    expect(err.textContent).toContain("open the project dashboard");
    expect(screen.queryByTestId("readiness-panel")).toBeNull();
  });
});

describe("generated plan", () => {
  it("sends exactly the same request as before", async () => {
    await generated();
    expect(post).toHaveBeenCalledWith("/projects/1/modernization", { language: "java", database: "postgresql", platform: "azure" });
  });

  it("shows results with units and meaning, from the plan only", async () => {
    await generated();
    expect(screen.getByText("Java 21 + Spring Boot 3")).toBeTruthy(); // summary strip
    expect(screen.getByText("5 of 5 tables converted automatically. Review before use.")).toBeTruthy();
    expect(screen.getByText("32 test scenarios covering 19 business rules, each traced to its source lines.")).toBeTruthy();
    expect(screen.getByText("Rehost · 0 programs")).toBeTruthy(); // a real zero is shown as zero
    expect(screen.getByText("1 medium")).toBeTruthy();
    expect(screen.queryAllByText("Generate the plan to see this section.")).toHaveLength(0);
  });

  it("gives every ⓘ a unique accessible name", async () => {
    await generated();
    const names = screen.getAllByRole("button", { name: /^About / }).map((b) => b.getAttribute("aria-label"));
    expect(names.length).toBeGreaterThanOrEqual(15);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("selections-changed banner", () => {
  it("is hidden for the latest plan, shown after a change, and cleared by generating again", async () => {
    await generated();
    expect(screen.queryByText(STALE)).toBeNull();

    fireEvent.change(screen.getByLabelText("Target database"), { target: { value: "oracle" } });
    expect(screen.getByText(STALE)).toBeTruthy();
    expect(screen.getByText("The results below are still for Java 21 + Spring Boot 3, PostgreSQL 16 and Microsoft Azure.")).toBeTruthy();

    post.mockResolvedValueOnce({ ...PLAN, targets: { ...PLAN.targets, database: "Oracle Database 23ai" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Generate plan again" })));
    expect(post).toHaveBeenLastCalledWith("/projects/1/modernization", { language: "java", database: "oracle", platform: "azure" });
    await waitFor(() => expect(screen.queryByText(STALE)).toBeNull());
  });

  it("disappears when the selections are changed back", async () => {
    await generated();
    const db = screen.getByLabelText("Target database");
    fireEvent.change(db, { target: { value: "mysql" } });
    expect(screen.getByText(STALE)).toBeTruthy();
    fireEvent.change(db, { target: { value: "postgresql" } });
    expect(screen.queryByText(STALE)).toBeNull();
  });
});
