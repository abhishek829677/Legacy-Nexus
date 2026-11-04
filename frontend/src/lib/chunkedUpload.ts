/**
 * Chunked, resumable file upload engine (the browser half of backend/app/services/doc_uploads.py).
 *
 * The file is sliced into the server's chunk size and sent a few pieces at a time. Each piece is retried
 * on its own with back-off; the server accepts re-sent pieces, so retries are safe. Progress is reported
 * in bytes, including the piece currently in flight.
 */

export type StartResponse = { upload_id: string; chunk_size: number; total_chunks: number; received: number[] };

/** How the engine talks to the server. Injected so the engine can be tested without a network. */
export type Transport = {
  start: (file: { name: string; size: number }) => Promise<StartResponse>;
  sendChunk: (uploadId: string, index: number, body: Blob, onBytes: (sent: number) => void, signal: AbortSignal) => Promise<void>;
  complete: <T>(uploadId: string) => Promise<T>;
  cancel: (uploadId: string) => Promise<void>;
};

export type Progress = { sent: number; total: number; chunksDone: number; chunksTotal: number };

export type UploadOptions = {
  onProgress?: (p: Progress) => void;
  signal?: AbortSignal;
  concurrency?: number; // pieces in flight at once
  retries?: number; // extra attempts per piece
  backoffMs?: (attempt: number) => number;
  sleep?: (ms: number) => Promise<void>;
};

export class UploadCancelled extends Error {
  constructor() {
    super("Upload cancelled");
  }
}

const defaultBackoff = (attempt: number) => [600, 1800, 4500, 9000][Math.min(attempt, 3)];
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function uploadInChunks<T>(file: Blob & { name: string }, transport: Transport, opts: UploadOptions = {}): Promise<T> {
  const { onProgress, signal, concurrency = 3, retries = 3, backoffMs = defaultBackoff, sleep = defaultSleep } = opts;
  const session = await transport.start({ name: file.name, size: file.size });
  const { upload_id: id, chunk_size: size, total_chunks: total } = session;
  const done = new Set(session.received); // resume: skip pieces the server already has
  const inFlight = new Map<number, number>();
  const pieceLength = (i: number) => Math.min(size, file.size - i * size);

  const report = () => {
    let sent = 0;
    done.forEach((i) => (sent += pieceLength(i)));
    inFlight.forEach((b) => (sent += b));
    onProgress?.({ sent: Math.min(sent, file.size), total: file.size, chunksDone: done.size, chunksTotal: total });
  };
  report();

  const local = new AbortController();
  const onAbort = () => local.abort();
  signal?.addEventListener("abort", onAbort);

  const queue = Array.from({ length: total }, (_, i) => i).filter((i) => !done.has(i));
  const sendOne = async (i: number) => {
    const body = file.slice(i * size, i * size + pieceLength(i));
    for (let attempt = 0; ; attempt++) {
      if (local.signal.aborted) throw new UploadCancelled();
      try {
        await transport.sendChunk(id, i, body, (b) => { inFlight.set(i, b); report(); }, local.signal);
        inFlight.delete(i);
        done.add(i);
        report();
        return;
      } catch (e) {
        inFlight.delete(i);
        if (local.signal.aborted) throw new UploadCancelled();
        if (attempt >= retries) throw e;
        await sleep(backoffMs(attempt));
      }
    }
  };

  try {
    const workers = Array.from({ length: Math.min(concurrency, Math.max(1, queue.length)) }, async () => {
      while (queue.length) {
        const next = queue.shift()!;
        await sendOne(next);
      }
    });
    await Promise.all(workers);
    if (local.signal.aborted) throw new UploadCancelled();
    return await transport.complete<T>(id);
  } catch (e) {
    const cancelled = !!signal?.aborted || e instanceof UploadCancelled;
    local.abort(); // stop the other pieces still in flight
    transport.cancel(id).catch(() => {}); // free the server-side session
    throw cancelled ? new UploadCancelled() : e;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}
