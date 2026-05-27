import { Injectable, Logger } from "@nestjs/common";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class InMemoryCacheService {
  private readonly logger = new Logger(InMemoryCacheService.name);
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private sweepInterval: NodeJS.Timeout | undefined;

  constructor() {
    this.sweepInterval = setInterval(() => this.sweep(), 60_000);
    if (typeof this.sweepInterval.unref === "function") {
      this.sweepInterval.unref();
    }
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  async wrap<T>(key: string, loader: () => Promise<T>, ttlSeconds: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;
    const value = await loader();
    this.set(key, value, ttlSeconds);
    return value;
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  private sweep(): void {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
        removed += 1;
      }
    }
    if (removed > 0) {
      this.logger.debug?.(`Cache sweep removed ${removed} expired entries`);
    }
  }

  onModuleDestroy(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = undefined;
    }
  }
}
