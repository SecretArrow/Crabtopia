// Crabtopia - Asset manager (pure bookkeeping, injectable loader).
//
// Knows nothing about rendering: a factory turns a src into a loaded
// asset (an HTMLImageElement in the browser, anything in tests). The
// default factory uses the global Image constructor when one exists
// and resolves null otherwise, so importing/preloading in a Node test
// environment is always safe.
//
// Dedupe guarantee: a given src reaches the factory AT MOST once while
// its load is in flight or cached — concurrent preload() calls for the
// same src share one factory call and one promise.

export type AssetFactory = (src: string) => Promise<unknown>;

function defaultFactory(src: string): Promise<unknown> {
  if (typeof Image === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise<unknown>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load asset: ${src}`));
    img.src = src;
  });
}

export class AssetManager {
  private readonly factory: AssetFactory;
  private readonly cache = new Map<string, unknown>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(factory?: AssetFactory) {
    this.factory = factory ?? defaultFactory;
  }

  private load(src: string): Promise<unknown> {
    if (this.cache.has(src)) {
      return Promise.resolve(this.cache.get(src));
    }
    const existing = this.inflight.get(src);
    if (existing) return existing;

    let raw: Promise<unknown>;
    try {
      raw = Promise.resolve(this.factory(src));
    } catch (err) {
      raw = Promise.reject(err);
    }
    // Note: a load that completes after clear() will still land in the
    // cache — acceptable, since its src was legitimately requested.
    const tracked: Promise<unknown> = raw.then(
      (value) => {
        this.cache.set(src, value);
        this.inflight.delete(src);
        return value;
      },
      (err: unknown) => {
        this.inflight.delete(src);
        throw err;
      },
    );
    this.inflight.set(src, tracked);
    return tracked;
  }

  /**
   * Load every src (deduped against the cache and against each other).
   * Rejects if any load rejects; successful loads stay cached.
   */
  async preload(srcs: string[]): Promise<void> {
    await Promise.all(srcs.map((src) => this.load(src)));
  }

  /** The loaded asset for src, or undefined if not (yet) loaded. */
  get(src: string): unknown | undefined {
    return this.cache.get(src);
  }

  isLoaded(src: string): boolean {
    return this.cache.has(src);
  }

  /** Drop all cached assets and forget in-flight registrations. */
  clear(): void {
    this.cache.clear();
    this.inflight.clear();
  }
}
