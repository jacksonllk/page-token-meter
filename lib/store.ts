import { Redis } from "@upstash/redis";

// Key-value storage for the cache, share links, rate limits and the daily credit cap.
// Upstash Redis when its variables are set (Vercel adds them), otherwise memory that is lost on restart.
export interface Store {
  get<T>(key: string): Promise<T | null>;
  // ttl in seconds. No ttl: keep forever.
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  // Adds `by` and returns the new value. The ttl starts when the key is created.
  incr(key: string, by: number, ttl: number): Promise<number>;
}

const PREFIX = "ptm:";

export function memoryStore(now = () => Date.now()): Store {
  const data = new Map<string, { value: unknown; expires: number }>();
  const read = (key: string) => {
    const entry = data.get(key);
    if (entry && entry.expires <= now()) data.delete(key);
    return data.get(key);
  };
  return {
    async get<T>(key: string) {
      return (read(key)?.value as T) ?? null;
    },
    async set(key, value, ttl) {
      // A copy, so a later change to the object cannot change what is stored.
      data.set(key, { value: structuredClone(value), expires: ttl ? now() + ttl * 1000 : Infinity });
    },
    async incr(key, by, ttl) {
      const entry = read(key);
      const value = ((entry?.value as number) ?? 0) + by;
      data.set(key, { value, expires: entry?.expires ?? now() + ttl * 1000 });
      return value;
    },
  };
}

export function redisStore(redis: Redis): Store {
  return {
    get: (key) => redis.get(PREFIX + key),
    async set(key, value, ttl) {
      await (ttl ? redis.set(PREFIX + key, value, { ex: ttl }) : redis.set(PREFIX + key, value));
    },
    async incr(key, by, ttl) {
      const value = await redis.incrby(PREFIX + key, by);
      // The first add created the key: start its clock.
      if (value === by) await redis.expire(PREFIX + key, ttl);
      return value;
    },
  };
}

// Kept on globalThis: Next.js loads the API routes and the pages as separate copies of this module,
// and the memory store must be one map for both.
const g = globalThis as { ptmStore?: Store };

// The Vercel Marketplace sets KV_REST_API_*. A database made on upstash.com uses UPSTASH_REDIS_REST_*.
export function getStore(): Store {
  if (g.ptmStore) return g.ptmStore;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  g.ptmStore = url && token ? redisStore(new Redis({ url, token })) : memoryStore();
  return g.ptmStore;
}
