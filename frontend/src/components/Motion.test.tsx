// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuideButton, PageGuide } from "./PageGuide";
import { Slider } from "./Motion";

const SLIDES = [
  { key: "a", label: "Alpha", content: <p>Alpha body</p> },
  { key: "b", label: "Beta", content: <p>Beta body</p> },
  { key: "c", label: "Gamma", content: <p>Gamma body</p> },
];
const current = () => screen.getAllByRole("group").find((g) => g.getAttribute("aria-hidden") === "false")!.getAttribute("aria-label");

function setReducedMotion(on: boolean) {
  window.matchMedia = ((q: string) => ({ matches: on && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
}

beforeEach(() => { vi.useFakeTimers(); setReducedMotion(false); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Slider", () => {
  it("advances on its own and wraps around", () => {
    render(<Slider slides={SLIDES} label="Demo" interval={1000} />);
    expect(current()).toBe("1 of 3: Alpha");
    act(() => vi.advanceTimersByTime(1000));
    expect(current()).toBe("2 of 3: Beta");
    act(() => vi.advanceTimersByTime(1000));
    expect(current()).toBe("3 of 3: Gamma");
    act(() => vi.advanceTimersByTime(1000));
    expect(current()).toBe("1 of 3: Alpha");
  });

  it("pauses on hover and with the pause button", () => {
    render(<Slider slides={SLIDES} label="Demo" interval={1000} />);
    const region = screen.getByRole("region", { name: "Demo" });
    fireEvent.mouseEnter(region);
    act(() => vi.advanceTimersByTime(3000));
    expect(current()).toBe("1 of 3: Alpha");
    fireEvent.mouseLeave(region);
    fireEvent.click(screen.getByRole("button", { name: "Pause slides" }));
    act(() => vi.advanceTimersByTime(3000));
    expect(current()).toBe("1 of 3: Alpha");
  });

  it("moves with arrows, dots and the keyboard", () => {
    render(<Slider slides={SLIDES} label="Demo" interval={1000} />);
    fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
    expect(current()).toBe("2 of 3: Beta");
    fireEvent.click(screen.getByRole("button", { name: "Previous slide" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous slide" }));
    expect(current()).toBe("3 of 3: Gamma");
    fireEvent.click(screen.getByRole("button", { name: "Show slide 2: Beta" }));
    expect(current()).toBe("2 of 3: Beta");
    fireEvent.keyDown(screen.getByRole("region", { name: "Demo" }), { key: "ArrowRight" });
    expect(current()).toBe("3 of 3: Gamma");
  });

  it("does not auto-advance when the user asked for reduced motion", () => {
    setReducedMotion(true);
    render(<Slider slides={SLIDES} label="Demo" interval={1000} />);
    act(() => vi.advanceTimersByTime(5000));
    expect(current()).toBe("1 of 3: Alpha");
    expect(screen.getByRole("button", { name: "Play slides" })).toBeTruthy();
  });
});

describe("PageGuide", () => {
  const guide = { title: "How to read it", steps: ["one", "two", "three"], terms: [["High", "check first"]] as [string, string][] };

  it("is open on first visit and remembers when closed", () => {
    localStorage.clear();
    const { unmount } = render(<PageGuide id="t" guide={guide} />);
    const head = screen.getByRole("button", { name: /How to read it/ });
    expect(head.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("two")).toBeTruthy();
    fireEvent.click(head);
    expect(head.getAttribute("aria-expanded")).toBe("false");
    unmount();
    render(<PageGuide id="t" guide={guide} />);
    expect(screen.getByRole("button", { name: /How to read it/ }).getAttribute("aria-expanded")).toBe("false");
  });

  it("opens in a dialog from the toolbar button", () => {
    render(<GuideButton guide={guide} />);
    fireEvent.click(screen.getByRole("button", { name: /How to read this/ }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("check first")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
