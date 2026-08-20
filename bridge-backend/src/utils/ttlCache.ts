/**
 * A minimal in-memory TTL cache. Used for idempotency keys and webhook event
 * de-duplication in the MVP. In production this would be backed by Redis; the
 * surface here is intentionally small so it can be swapped.
 */
export class TtlCache<T> {
  private readonly store = new Map<string, { value: T; expiresAt: number }>();

  constructor(private readonly defaultTtlMs: number) {}

  private now(): number {
    return Date.now();
  }

  /** Store a value under `key`, expiring after `ttlMs` (or the default). */
  set(key: string, value: T, ttlMs?: number): void {
    const expiresAt = this.now() + (ttlMs ?? this.defaultTtlMs);
    this.store.set(key, { value, expiresAt });
  }

  /** Get a live value, or undefined if missing/expired (expired ones are swept). */
  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  /** Remove all expired entries. Call periodically to bound memory. */
  sweep(): void {
    const now = this.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) this.store.delete(key);
    }
  }
}
