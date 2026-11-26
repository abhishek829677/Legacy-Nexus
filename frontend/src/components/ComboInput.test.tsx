// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ComboInput } from "./ComboInput";

const MODELS = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"];
function Harness({ start = "claude-sonnet-5-5" }: { start?: string }) {
  const [v, setV] = useState(start);
  return <><ComboInput id="m" value={v} onChange={setV} options={MODELS} /><output>{v}</output></>;
}
const box = () => screen.getByRole("combobox") as HTMLInputElement;
const options = () => screen.queryAllByRole("option").map((o) => o.textContent);

afterEach(cleanup);

describe("ComboInput", () => {
  it("shows every suggestion when the field already holds one (a datalist would show only that one)", () => {
    render(<Harness />);
    fireEvent.focus(box());
    expect(options()).toEqual(MODELS);
    expect(screen.getByRole("option", { selected: true }).textContent).toBe("claude-sonnet-5-5");
  });

  it("filters while typing and still accepts a name that is not in the list", () => {
    render(<Harness start="" />);
    fireEvent.change(box(), { target: { value: "opus" } });
    expect(options()).toEqual(["claude-opus-5-5"]);
    fireEvent.change(box(), { target: { value: "my-custom-model" } });
    expect(options()).toEqual([]);
    expect(document.querySelector("output")!.textContent).toBe("my-custom-model");
  });

  it("picks with the mouse or the keyboard", () => {
    render(<Harness />);
    fireEvent.focus(box());
    fireEvent.click(screen.getByText("claude-haiku-5-5"));
    expect(box().value).toBe("claude-haiku-5-5");
    expect(options()).toEqual([]); // closed after picking
    fireEvent.keyDown(box(), { key: "ArrowDown" }); // opens on the current value
    fireEvent.keyDown(box(), { key: "ArrowUp" });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(box().value).toBe("claude-opus-5-5");
  });

  it("closes on Escape without letting the key reach the dialog", () => {
    let reachedDialog = false;
    render(<div onKeyDown={(e) => { if (e.key === "Escape") reachedDialog = true; }}><Harness /></div>);
    fireEvent.focus(box());
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(options()).toEqual([]);
    expect(reachedDialog).toBe(false);
  });

  it("hides the text cursor after picking or opening with the arrow, and shows it again for typing", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Show suggestions" }));
    expect(box().style.caretColor).toBe("transparent");
    fireEvent.click(screen.getByText("claude-opus-5-5"));
    expect(box().style.caretColor).toBe("transparent");
    fireEvent.click(screen.getByRole("button", { name: "Show suggestions" }));
    expect(box().style.caretColor).toBe("transparent");
    fireEvent.click(box()); // clicking into the text means editing
    expect(box().style.caretColor).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Show suggestions" }));
    fireEvent.change(box(), { target: { value: "claude-o" } }); // so does typing
    expect(box().style.caretColor).toBe("");
  });
});
