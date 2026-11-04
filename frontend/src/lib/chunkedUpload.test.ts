import { describe, expect, it, vi } from "vitest";
import { uploadInChunks, UploadCancelled, type Transport } from "./chunkedUpload";

const file = (size: number, name = "big.pdf") => Object.assign(new Blob([new Uint8Array(size)]), { name });

function fakeTransport(over: Partial<Transport> & { chunk?: number; received?: number[] } = {}) {
  const chunk = over.chunk ?? 10;
  const sent: { index: number; size: number }[] = [];
  const t: Transport & { sent: typeof sent } = {
    sent,
    start: vi.fn(async (f) => ({ upload_id: "u1", chunk_size: chunk, total_chunks: Math.ceil(f.size / chunk), received: over.received ?? [] })),
    sendChunk: over.sendChunk ?? vi.fn(async (_id, index, body, onBytes) => { onBytes(body.size); sent.push({ index, size: body.size }); }),
    complete: vi.fn(async () => ({ id: 42, status: "processing" })) as Transport["complete"],
    cancel: vi.fn(async () => {}),
  };
  return t;
}
const noWait = { sleep: () => Promise.resolve(), backoffMs: () => 0 };

describe("uploadInChunks", () => {
  it("sends every piece with the right size and completes", async () => {
    const t = fakeTransport();
    const doc = await uploadInChunks<{ id: number }>(file(35), t, noWait);
    expect(doc.id).toBe(42);
    expect(t.sent.map((s) => s.index).sort()).toEqual([0, 1, 2, 3]);
    expect(t.sent.find((s) => s.index === 3)!.size).toBe(5); // the last piece is the remainder
    expect(t.complete).toHaveBeenCalledWith("u1");
  });

  it("reports progress up to the full size", async () => {
    const seen: number[] = [];
    await uploadInChunks(file(25), fakeTransport(), { ...noWait, onProgress: (p) => seen.push(p.sent) });
    expect(seen[0]).toBe(0);
    expect(seen[seen.length - 1]).toBe(25);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen.slice().sort((a, b) => a - b)); // never above total
  });

  it("resumes: pieces the server already has are not sent again", async () => {
    const t = fakeTransport({ received: [0, 2] });
    await uploadInChunks(file(40), t, noWait);
    expect(t.sent.map((s) => s.index).sort()).toEqual([1, 3]);
  });

  it("retries a failing piece on its own", async () => {
    let fails = 2;
    const t = fakeTransport({
      sendChunk: vi.fn(async (_id, index, body, onBytes) => {
        if (index === 1 && fails-- > 0) throw new Error("network");
        onBytes(body.size);
      }),
    });
    await uploadInChunks(file(30), t, noWait);
    expect((t.sendChunk as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[1] === 1)).toHaveLength(3);
    expect(t.cancel).not.toHaveBeenCalled();
  });

  it("gives up after the retries, frees the server session and reports the error", async () => {
    const t = fakeTransport({ sendChunk: vi.fn(async () => { throw new Error("Piece 0 is incomplete"); }) });
    await expect(uploadInChunks(file(30), t, { ...noWait, retries: 2 })).rejects.toThrow("Piece 0 is incomplete");
    expect(t.cancel).toHaveBeenCalledWith("u1");
    expect(t.complete).not.toHaveBeenCalled();
  });

  it("can be cancelled part-way through", async () => {
    const controller = new AbortController();
    const t = fakeTransport({
      sendChunk: vi.fn(async (_id, index, body, onBytes, signal) => {
        if (index === 1) controller.abort();
        if (signal.aborted) throw new UploadCancelled();
        onBytes(body.size);
      }),
    });
    await expect(uploadInChunks(file(50), t, { ...noWait, concurrency: 1, signal: controller.signal })).rejects.toBeInstanceOf(UploadCancelled);
    expect(t.cancel).toHaveBeenCalledWith("u1");
    expect(t.complete).not.toHaveBeenCalled();
  });

  it("never has more pieces in flight than the concurrency allows", async () => {
    let active = 0, peak = 0;
    const t = fakeTransport({
      sendChunk: vi.fn(async (_id, _i, body, onBytes) => {
        active++; peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 2));
        onBytes(body.size); active--;
      }),
    });
    await uploadInChunks(file(100), t, { ...noWait, concurrency: 3 });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });
});
