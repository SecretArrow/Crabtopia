// Unit tests for the asset manager's dedupe/cache bookkeeping.
// Pure logic testing — an injected fake factory replaces real loading.
import { describe, it, expect, vi } from "vitest";
import { AssetManager } from "../../src/game/animation/assetManager";

describe("AssetManager", () => {
  it("calls the factory once per unique src and caches the result", async () => {
    const factory = vi.fn(async (src: string) => ({ src }));
    const am = new AssetManager(factory);
    await am.preload(["/a.png", "/b.png"]);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(am.isLoaded("/a.png")).toBe(true);
    expect(am.get("/a.png")).toEqual({ src: "/a.png" });
    expect(am.get("/missing.png")).toBeUndefined();
    // Re-preloading cached srcs must not call the factory again.
    await am.preload(["/a.png", "/b.png"]);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("dedupes duplicate srcs within a single preload call", async () => {
    const factory = vi.fn(async (src: string) => ({ src }));
    const am = new AssetManager(factory);
    await am.preload(["/a.png", "/a.png", "/a.png"]);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent in-flight preloads of the same src", async () => {
    let release: (value: unknown) => void = () => undefined;
    const factory = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          release = resolve;
        }),
    );
    const am = new AssetManager(factory);
    const p1 = am.preload(["/slow.png"]);
    const p2 = am.preload(["/slow.png"]);
    // Both preloads started while the first load is still in flight:
    // the factory must have been called exactly once.
    expect(factory).toHaveBeenCalledTimes(1);
    expect(am.isLoaded("/slow.png")).toBe(false);
    release({ ok: true });
    await Promise.all([p1, p2]);
    expect(am.isLoaded("/slow.png")).toBe(true);
    expect(am.get("/slow.png")).toEqual({ ok: true });
  });

  it("a failed load is not cached and can be retried", async () => {
    let attempts = 0;
    const factory = vi.fn(async (src: string) => {
      attempts++;
      if (attempts === 1) throw new Error("boom");
      return { src };
    });
    const am = new AssetManager(factory);
    await expect(am.preload(["/x.png"])).rejects.toThrow("boom");
    expect(am.isLoaded("/x.png")).toBe(false);
    await am.preload(["/x.png"]);
    expect(am.isLoaded("/x.png")).toBe(true);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("clear drops the cache so srcs load again", async () => {
    const factory = vi.fn(async (src: string) => ({ src }));
    const am = new AssetManager(factory);
    await am.preload(["/a.png"]);
    expect(am.isLoaded("/a.png")).toBe(true);
    am.clear();
    expect(am.isLoaded("/a.png")).toBe(false);
    expect(am.get("/a.png")).toBeUndefined();
    await am.preload(["/a.png"]);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("default factory is safe without an Image global result", async () => {
    // In jsdom an Image constructor exists but never fires onload for a
    // fake src, so here we only assert the manager constructs cleanly
    // and reports nothing loaded before any preload settles.
    const am = new AssetManager();
    expect(am.isLoaded("/never.png")).toBe(false);
    expect(am.get("/never.png")).toBeUndefined();
  });
});
