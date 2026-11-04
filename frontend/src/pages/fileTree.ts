/** Pure helpers for the Files page explorer: build a folder tree, compact single-folder chains, flatten for display. */

export type FileRow = { path: string; language: string | null; size_bytes: number; line_count: number | null };

export type DirNode = {
  kind: "dir";
  name: string; // display name; compacted chains read "classes/com/company"
  start: string; // path of the first folder in a compacted chain
  path: string; // path of the last folder in the chain (used as the open/closed key)
  children: TreeNode[];
  fileCount: number; // files anywhere below this folder
};
export type FileNode = { kind: "file"; name: string; path: string; file: FileRow };
export type TreeNode = DirNode | FileNode;

const byName = (a: TreeNode, b: TreeNode) =>
  a.kind !== b.kind ? (a.kind === "dir" ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

/** Builds the folder tree. Folders come first, then files, both in natural name order. */
export function buildTree(files: FileRow[]): DirNode {
  const root: DirNode = { kind: "dir", name: "", start: "", path: "", children: [], fileCount: 0 };
  const dirs = new Map<string, DirNode>([["", root]]);
  for (const f of files) {
    const parts = f.path.split("/").filter(Boolean);
    let parent = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const path = parts.slice(0, i + 1).join("/");
      let d = dirs.get(path);
      if (!d) {
        d = { kind: "dir", name: parts[i], start: path, path, children: [], fileCount: 0 };
        dirs.set(path, d);
        parent.children.push(d);
      }
      parent = d;
    }
    parent.children.push({ kind: "file", name: parts[parts.length - 1] ?? f.path, path: f.path, file: f });
  }
  const finish = (d: DirNode): number => {
    d.children.sort(byName);
    d.fileCount = d.children.reduce((n, c) => n + (c.kind === "file" ? 1 : finish(c)), 0);
    return d.fileCount;
  };
  finish(root);
  return compact(root);
}

/** Merges a folder that contains only one folder into a single row, like VS Code's compact folders. */
function compact(d: DirNode): DirNode {
  d.children = d.children.map((c) => (c.kind === "dir" ? compact(c) : c));
  if (d.path !== "" && d.children.length === 1 && d.children[0].kind === "dir") {
    const only = d.children[0];
    return { ...only, name: `${d.name}/${only.name}`, start: d.start };
  }
  return d;
}

/** Every folder that contains the given file or folder path, e.g. "a/b/c.txt" -> ["a", "a/b"]. */
export function ancestors(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
}

/** True when a folder row covers the given folder path (directly, or inside its compacted chain). */
export function rowCovers(row: DirNode, folder: string): boolean {
  return (row.path === folder || row.path.startsWith(`${folder}/`)) && (folder === row.start || folder.startsWith(`${row.start}/`));
}

export type Row = { node: TreeNode; depth: number; open: boolean; parent: string | null };

/** The rows on screen, in order. A compacted folder is open when any folder in its chain is in `expanded`. */
export function flatten(root: DirNode, expanded: Set<string>, openAll = false): Row[] {
  const rows: Row[] = [];
  const walk = (d: DirNode, depth: number, parent: string | null) => {
    for (const c of d.children) {
      if (c.kind === "file") {
        rows.push({ node: c, depth, open: false, parent });
        continue;
      }
      const open = openAll || expanded.has(c.path);
      rows.push({ node: c, depth, open, parent });
      if (open) walk(c, depth + 1, c.path);
    }
  };
  walk(root, 0, null);
  return rows;
}

/** Case-insensitive match on the whole path, so folder names match too. */
export function filterFiles(files: FileRow[], query: string): FileRow[] {
  const q = query.trim().toLowerCase();
  return q ? files.filter((f) => f.path.toLowerCase().includes(q)) : files;
}
