// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PLAN_1_SAMPLE, PLAN_2_AWS } from "./__fixtures__/readiness";
import { NOT_AVAILABLE } from "./modernize.copy";
import { ReadinessPanel, type Readiness } from "./ReadinessPanel";

const TARGETS = { language: "Java 21 + Spring Boot 3", database: "PostgreSQL 16", platform: "Microsoft Azure" };
const NAMES = ["Code complexity", "Rule traceability", "Self-documentation", "Interface clarity", "Static resolvability"];

afterEach(cleanup);

const panel = (r: Readiness = PLAN_2_AWS) => render(<ReadinessPanel readiness={r} targets={TARGETS} />);
const infoButton = (name: string) => screen.getByRole("button", { name: `About ${name}` });

describe("ReadinessPanel rows", () => {
  it("shows an ⓘ button, weight, bar and x / 100 on every factor", () => {
    panel();
    for (const name of NAMES) {
      expect(infoButton(name).tagName).toBe("BUTTON");
      expect(screen.getByRole("meter", { name: new RegExp(`^${name}:`) })).toBeTruthy();
    }
    expect(screen.getAllByText("Weight: 20%")).toHaveLength(5);
    const row = screen.getByTestId("factor-self_documentation");
    expect(within(row).getByText("48 / 100")).toBeTruthy();
    expect(within(row).getByText("Needs attention")).toBeTruthy(); // status is text, not colour only
  });

  it("does not show formulas in the row", () => {
    panel();
    expect(screen.queryByText(/Score =/)).toBeNull();
  });

  it("has an ⓘ for the overall score", () => {
    panel();
    expect(infoButton("Migration readiness")).toBeTruthy();
  });
});

describe("ⓘ panel behaviour", () => {
  it("opens on hover and closes when the pointer leaves", () => {
    panel();
    const btn = infoButton("Static resolvability");
    fireEvent.mouseEnter(btn.parentElement!);
    expect(screen.getByRole("dialog", { name: "Static resolvability" })).toBeTruthy();
    fireEvent.mouseLeave(btn.parentElement!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens on keyboard focus and closes with Esc, returning focus to the button", () => {
    panel();
    const btn = infoButton("Interface clarity");
    act(() => btn.focus());
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(btn);
  });

  it("opens on click/tap, stays open, and closes on a second click or an outside click", () => {
    panel();
    const btn = infoButton("Code complexity");
    fireEvent.click(btn);
    expect(screen.getByRole("dialog", { name: "Code complexity" })).toBeTruthy();
    fireEvent.mouseLeave(btn.parentElement!); // pinned: leaving does not close it
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(btn);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the formula collapsed until expanded", () => {
    panel();
    fireEvent.click(infoButton("Static resolvability"));
    const dialog = screen.getByRole("dialog");
    const summary = within(dialog).getByText("How is this score calculated?");
    const details = summary.closest("details")!;
    expect(details.open).toBe(false);
    expect(within(dialog).getByText("Score = 100 − (dynamic calls × 20), never below 0.")).toBeTruthy();
  });

  it("shows the four labelled sections with this plan's values", () => {
    panel();
    fireEvent.click(infoButton("Static resolvability"));
    const d = screen.getByRole("dialog");
    for (const h of ["What it measures", "Your result", "What this score means", "What to do next"]) expect(within(d).getByText(h)).toBeTruthy();
    expect(within(d).getAllByText("1,177 calls that can't be resolved without running the app.").length).toBeGreaterThan(0);
    expect(within(d).getByText(/^Needs attention\./)).toBeTruthy();
  });
});

describe("data binding", () => {
  it("tooltip values change together with the scores when the plan changes", () => {
    const { rerender } = panel(PLAN_2_AWS);
    fireEvent.click(infoButton("Self-documentation"));
    expect(within(screen.getByRole("dialog")).getByText("1,211 of 2,497 programs have a purpose header.")).toBeTruthy();
    expect(within(screen.getByTestId("factor-self_documentation")).getByText("48 / 100")).toBeTruthy();

    rerender(<ReadinessPanel readiness={PLAN_1_SAMPLE} targets={TARGETS} />);
    expect(within(screen.getByRole("dialog")).getByText("6 of 6 programs have a purpose header.")).toBeTruthy();
    expect(within(screen.getByTestId("factor-self_documentation")).getByText("100 / 100")).toBeTruthy();
  });
});

describe("missing values", () => {
  it("shows the not-available text instead of a number", () => {
    const partial: Readiness = {
      score: 30,
      level: "High effort",
      factors: [
        { key: "static_resolvability", name: "Static resolvability", score: 0, detail: "", inputs: {} },
        { key: "interface_clarity", name: "Interface clarity", score: 0, detail: "" },
      ],
    };
    panel(partial);
    expect(screen.getAllByText(`Weight: ${NOT_AVAILABLE}`)).toHaveLength(2);
    expect(within(screen.getByTestId("factor-static_resolvability")).getAllByText(NOT_AVAILABLE).length).toBeGreaterThan(0);
    expect(within(screen.getByTestId("factor-interface_clarity")).getAllByText(NOT_AVAILABLE).length).toBeGreaterThan(0);
  });

  it("falls back to the backend detail text when structured inputs are absent", () => {
    panel({ score: 98, level: "Ready", factors: [{ name: "Code complexity", key: "code_complexity", score: 88, detail: "Average cyclomatic complexity 4.0" }] });
    expect(screen.getByText("Average cyclomatic complexity 4.0")).toBeTruthy();
  });
});
