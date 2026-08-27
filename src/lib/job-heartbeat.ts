import { RedisClient } from "bun";

function heartbeatPrefix(): string {
  return process.env.PAPERBOY_QUEUE_PREFIX?.trim() || "paperboy";
}

function heartbeatRedisConfigured(): boolean {
  return (
    Boolean(process.env.REDIS_URL?.trim()) &&
    process.env.PAPERBOY_INLINE_JOB_DISPATCH !== "false"
  );
}

export const JOB_HEARTBEAT_TTL_SECONDS = 30;

export type JobHeartbeatStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ttlSeconds: number) => Promise<void>;
};

let redisStore: JobHeartbeatStore | null | undefined;

export function jobHeartbeatKey(prefix: string): string {
  return `${prefix}:jobs:heartbeat`;
}

export function memoryJobHeartbeatStore(): JobHeartbeatStore {
  const values = new Map<string, { expiresAt: number; value: string }>();
  return {
    async get(key) {
      const entry = values.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        values.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(key, value, ttlSeconds) {
      values.set(key, {
        expiresAt: Date.now() + ttlSeconds * 1_000,
        value,
      });
    },
  };
}

async function redisHeartbeatStore(): Promise<JobHeartbeatStore | null> {
  if (redisStore !== undefined) return redisStore;
  if (!heartbeatRedisConfigured()) {
    redisStore = null;
    return null;
  }

  try {
    const client = new RedisClient(process.env.REDIS_URL!.trim());
    redisStore = {
      async get(key) {
        const value = await client.get(key);
        return value == null ? null : String(value);
      },
      async set(key, value, ttlSeconds) {
        await client.send("SETEX", [key, String(ttlSeconds), value]);
      },
    };
    return redisStore;
  } catch {
    redisStore = null;
    return null;
  }
}

export async function touchJobHeartbeat(input: {
  prefix?: string;
  store?: JobHeartbeatStore;
  workerId: string;
}): Promise<void> {
  const store = input.store ?? (await redisHeartbeatStore());
  if (!store) return;
  await store.set(
    jobHeartbeatKey(input.prefix ?? heartbeatPrefix()),
    input.workerId.slice(0, 96),
    JOB_HEARTBEAT_TTL_SECONDS,
  );
}

export async function jobsWorkerIsLive(input: {
  prefix?: string;
  store?: JobHeartbeatStore;
} = {}): Promise<boolean> {
  const store = input.store ?? (await redisHeartbeatStore());
  if (!store) return false;
  try {
    return Boolean(
      await store.get(jobHeartbeatKey(input.prefix ?? heartbeatPrefix())),
    );
  } catch {
    return false;
  }
}
