/**
 * Reads whole folders the user hands us, with a running count of files found.
 *
 * Two sources:
 *  - a drop: `dataTransfer.files` only lists the top-level items and gives a useless placeholder for a folder,
 *    so folders are walked through the File System entry API instead;
 *  - the folder button: where the browser has `showDirectoryPicker` (Chrome, Edge) we walk the folder
 *    ourselves, so the count can be shown while it is read. Elsewhere the caller falls back to
 *    `<input webkitdirectory>`, which gives no progress until every file is listed.
 *
 * Files found inside a folder get the same `webkitRelativePath` ("folder/sub/FILE.CBL") that the folder
 * input sets, so the rest of the app treats every kind of folder the same way.
 */

/** Reports the count every 25 files rather than on every file, to keep re-renders cheap. */
const counter = (out: File[], onFound?: (count: number) => void) => () => {
  if (out.length % 25 === 0) onFound?.(out.length);
};

const tagPath = (file: File, path: string) => {
  if (path.includes("/")) Object.defineProperty(file, "webkitRelativePath", { value: path, configurable: true });
  return file;
};

/* ---------------- drag and drop ---------------- */

export async function filesFromDrop(dt: DataTransfer, onFound?: (count: number) => void): Promise<File[]> {
  // Everything on the DataTransfer must be read now: it is emptied once the drop event handler returns.
  const plain = Array.from(dt.files);
  const entries = Array.from(dt.items ?? [])
    .filter((i) => i.kind === "file")
    .map((i) => (typeof i.webkitGetAsEntry === "function" ? i.webkitGetAsEntry() : null));
  if (!entries.length || entries.some((e) => !e)) return plain; // browser without the entry API

  const out: File[] = [];
  const found = counter(out, onFound);
  for (const entry of entries) await walkEntry(entry!, out, found);
  return out;
}

async function walkEntry(entry: FileSystemEntry, out: File[], found: () => void): Promise<void> {
  if (entry.isFile) {
    try {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      out.push(tagPath(file, entry.fullPath.replace(/^\/+/, "")));
      found();
    } catch {
      /* unreadable file (permissions, removed meanwhile): skip it */
    }
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries returns the folder in batches (about 100 at a time in Chrome); keep reading until empty.
    for (;;) {
      let batch: FileSystemEntry[];
      try {
        batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      } catch {
        return;
      }
      if (!batch.length) return;
      for (const child of batch) await walkEntry(child, out, found);
    }
  }
}

/* ---------------- folder button (File System Access API) ---------------- */

// Not in TypeScript's DOM library yet, so only the parts used here are declared.
type FileHandle = { kind: "file"; name: string; getFile(): Promise<File> };
export type DirectoryHandle = { kind: "directory"; name: string; values(): AsyncIterable<FileHandle | DirectoryHandle> };
type DirectoryPickerWindow = { showDirectoryPicker?: (opts?: { mode?: "read" }) => Promise<DirectoryHandle> };

/** True where the browser can open a folder for us to read with progress (Chrome, Edge). */
export const canPickDirectory = () => typeof (window as unknown as DirectoryPickerWindow).showDirectoryPicker === "function";

/**
 * Opens the folder picker. Resolves with the folder, or null if the user closed the picker.
 * Rejects if the browser refuses the folder (for example a protected system folder).
 */
export async function pickDirectory(): Promise<DirectoryHandle | null> {
  try {
    return await (window as unknown as DirectoryPickerWindow).showDirectoryPicker!({ mode: "read" });
  } catch (e) {
    if ((e as Error).name === "AbortError") return null;
    throw e;
  }
}

/** Reads every file in a picked folder (and its subfolders), reporting the count as it goes. */
export async function filesFromDirectory(dir: DirectoryHandle, onFound?: (count: number) => void): Promise<File[]> {
  const out: File[] = [];
  const found = counter(out, onFound);
  await walkHandle(dir, dir.name, out, found);
  return out;
}

async function walkHandle(dir: DirectoryHandle, prefix: string, out: File[], found: () => void): Promise<void> {
  let children: AsyncIterable<FileHandle | DirectoryHandle>;
  try {
    children = dir.values();
  } catch {
    return;
  }
  try {
    for await (const child of children) {
      const path = `${prefix}/${child.name}`;
      if (child.kind === "file") {
        try {
          out.push(tagPath(await child.getFile(), path));
          found();
        } catch {
          /* unreadable file: skip it */
        }
      } else {
        await walkHandle(child, path, out, found);
      }
    }
  } catch {
    /* folder became unreadable part-way: keep what was found */
  }
}
