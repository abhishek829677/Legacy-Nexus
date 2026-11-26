// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOAST_MS, ToastProvider, useToast } from "./ui";

function Trigger({ text, error }: { text: string; error?: boolean }) {
  const toast = useToast();
  return <button onClick={() => toast(text, error)}>show</button>;
}
const show = (text = "Saved", error = false) => {
  render(<ToastProvider><Trigger text={text} error={error} /></ToastProvider>);
  fireEvent.click(screen.getByText("show"));
  return () => screen.queryByText(text);
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("toasts", () => {
  it("closes on its own after a few seconds", () => {
    const find = show();
    act(() => vi.advanceTimersByTime(TOAST_MS.info - 100));
    expect(find()).toBeTruthy();
    act(() => vi.advanceTimersByTime(200));
    expect(find()).toBeNull();
  });

  it("stays while hovered and starts the countdown again when the mouse leaves", () => {
    const find = show();
    act(() => vi.advanceTimersByTime(3000));
    fireEvent.mouseEnter(find()!.closest(".toast")!);
    act(() => vi.advanceTimersByTime(60_000));
    expect(find()).toBeTruthy();
    fireEvent.mouseLeave(find()!.closest(".toast")!);
    act(() => vi.advanceTimersByTime(TOAST_MS.info - 100)); // a full countdown, not the 500 ms that were left
    expect(find()).toBeTruthy();
    act(() => vi.advanceTimersByTime(200));
    expect(find()).toBeNull();
  });

  it("closes at once with the close button", () => {
    const find = show("Could not connect", true);
    fireEvent.click(screen.getByRole("button", { name: "Close notification" }));
    expect(find()).toBeNull();
  });

  it("keeps other toasts' timers when a new one appears", () => {
    render(<ToastProvider><Trigger text="first" /></ToastProvider>);
    fireEvent.click(screen.getByText("show"));
    act(() => vi.advanceTimersByTime(3000));
    fireEvent.click(screen.getByText("show")); // re-renders the list
    act(() => vi.advanceTimersByTime(600));
    expect(screen.getAllByText("first")).toHaveLength(1); // the first one closed on time; only the second is left
  });
});
