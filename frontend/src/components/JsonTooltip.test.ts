import { describe, expect, it } from "vitest";
import { shorten } from "./JsonTooltip";

describe("shorten", () => {
  it("leaves short JSON alone", () => {
    expect(shorten('{"name":"aws"}', 40)).toBe('{"name":"aws"}');
  });

  it("breaks after the last whole field, never inside a number", () => {
    expect(shorten('{"files":245,"skipped":84,"bytes":4190347}', 40)).toBe('{"files":245,"skipped":84,...');
  });

  it("cuts inside the first field when it alone is too long", () => {
    const s = shorten('{"file":"aws-mainframe-modernization-carddemo-main/app/x.cbl"}', 40);
    expect(s).toBe('{"file":"aws-mainframe-modernization-car...');
  });
});
