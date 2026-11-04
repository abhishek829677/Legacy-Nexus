import { describe, expect, it } from "vitest";
import { ancestors, buildTree, filterFiles, flatten, rowCovers, type DirNode, type FileRow } from "./fileTree";

const f = (path: string): FileRow => ({ path, language: null, size_bytes: 1, line_count: 1 });
const FILES = [
  f("cobol/ACCOUNT.CBL"),
  f("cobol/CUSTOMER.CBL"),
  f("README.md"),
  f("ws/app/WebContent/WEB-INF/classes/com/company/A.java"),
  f("ws/app/WebContent/WEB-INF/classes/com/company/B.java"),
  f("ws/app/pom.xml"),
  f("cobol/file10.cbl"),
  f("cobol/file2.cbl"),
];

describe("buildTree", () => {
  const root = buildTree(FILES);

  it("puts folders first, then files, in natural order", () => {
    expect(root.children.map((c) => c.name)).toEqual(["cobol", "ws/app", "README.md"]);
    const cobol = root.children[0] as DirNode;
    expect(cobol.children.map((c) => c.name)).toEqual(["ACCOUNT.CBL", "CUSTOMER.CBL", "file2.cbl", "file10.cbl"]);
  });

  it("compacts chains of single folders into one row", () => {
    const app = root.children[1] as DirNode;
    expect(app.name).toBe("ws/app");
    expect(app.start).toBe("ws");
    expect(app.path).toBe("ws/app");
    const deep = app.children[0] as DirNode;
    expect(deep.name).toBe("WebContent/WEB-INF/classes/com/company");
    expect(deep.start).toBe("ws/app/WebContent");
    expect(deep.path).toBe("ws/app/WebContent/WEB-INF/classes/com/company");
  });

  it("counts files below every folder", () => {
    expect(root.fileCount).toBe(8);
    expect((root.children[0] as DirNode).fileCount).toBe(4);
    expect((root.children[1] as DirNode).fileCount).toBe(3);
  });

  it("handles an empty list", () => {
    expect(buildTree([]).children).toEqual([]);
  });
});

describe("flatten", () => {
  const root = buildTree(FILES);

  it("shows only top-level rows when nothing is open", () => {
    expect(flatten(root, new Set()).map((r) => r.node.name)).toEqual(["cobol", "ws/app", "README.md"]);
  });

  it("revealing a file opens every folder above it, including compacted ones", () => {
    const target = "ws/app/WebContent/WEB-INF/classes/com/company/B.java";
    const rows = flatten(root, new Set(ancestors(target)));
    const hit = rows.find((r) => r.node.path === target)!;
    expect(hit.depth).toBe(2);
    expect(hit.parent).toBe("ws/app/WebContent/WEB-INF/classes/com/company");
  });

  it("opens everything while searching", () => {
    const rows = flatten(buildTree(filterFiles(FILES, "company")), new Set(), true);
    expect(rows.filter((r) => r.node.kind === "file").map((r) => r.node.name)).toEqual(["A.java", "B.java"]);
  });
});

describe("helpers", () => {
  it("lists ancestors", () => {
    expect(ancestors("a/b/c.txt")).toEqual(["a", "a/b"]);
    expect(ancestors("c.txt")).toEqual([]);
  });

  it("filters on the whole path, ignoring case", () => {
    expect(filterFiles(FILES, "COBOL").length).toBe(4);
    expect(filterFiles(FILES, "  ").length).toBe(8);
    expect(filterFiles(FILES, "nothing")).toEqual([]);
  });

  it("knows which compacted row covers a folder in its chain", () => {
    const deep = (buildTree(FILES).children[1] as DirNode).children[0] as DirNode;
    expect(rowCovers(deep, "ws/app/WebContent/WEB-INF")).toBe(true);
    expect(rowCovers(deep, "ws/app/WebContent/WEB-INF/classes/com/company")).toBe(true);
    expect(rowCovers(deep, "ws/app")).toBe(false);
    expect(rowCovers(deep, "cobol")).toBe(false);
  });
});
