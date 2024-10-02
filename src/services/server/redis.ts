import Redis from "ioredis";

let redis: Redis;

export const KEY_PREFIX_NEXT = `next:${process.env.APP_HOSTNAME}:`;
export const KEY_PREFIX_NEXT_SESSION = `${KEY_PREFIX_NEXT}session:`;

export const getRedisClient = async () => {
  if (redis) {
    return redis;
  }
  redis = new Redis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || "", 10),
    password: process.env.REDIS_PASSWORD,
    lazyConnect: true,
  });

  try {
    await redis.connect();
  } catch {
    // No need to handle this
  }

  return redis;
};
