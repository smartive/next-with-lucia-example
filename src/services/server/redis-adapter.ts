import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import Redis from "ioredis";
import { KEY_PREFIX_NEXT_SESSION, getRedisClient } from "./redis";
import { Adapter, DatabaseSession, DatabaseUser } from "lucia";

const SESSION_REDIS_KEY_PREFIX = `${KEY_PREFIX_NEXT_SESSION}user:`;
const SESSION_REDIS_DATA_KEY_PREFIX = `${KEY_PREFIX_NEXT_SESSION}user-data:`;
const SESSION_REDIS_USER_KEY_PREFIX = `user-`;
const SESSION_REDIS_SESSION_KEY_PREFIX = `session-`;

const ENCYPTION_ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;
const SESSION_DURATION_IN_SECONDS = 24 * 60 * 60;

export class RedisSessionAdapter implements Adapter {
  redisClient?: Redis;

  getRedisClient = async () => {
    if (!this.redisClient) {
      this.redisClient = await getRedisClient();
    }
    return this.redisClient;
  };

  async getUserSessions(userId: string): Promise<DatabaseSession[]> {
    const redisClient = await this.getRedisClient();
    const sessionIds = await redisClient.get(
      `${SESSION_REDIS_KEY_PREFIX}${SESSION_REDIS_USER_KEY_PREFIX}${userId}`
    );
    if (!sessionIds) {
      return [];
    }
    const sessions = await Promise.all(
      JSON.parse(sessionIds).map((id: string) =>
        redisClient.get(
          `${SESSION_REDIS_KEY_PREFIX}${SESSION_REDIS_SESSION_KEY_PREFIX}${id}`
        )
      )
    );

    const session: DatabaseSession[] = [];
    for (const session of sessions) {
      const parsedSession = await decryptSessionData(session);
      if (parsedSession !== null) {
        session.push(parsedSession);
      }
    }
    return session;
  }

  async setSession(session: DatabaseSession): Promise<void> {
    const redisClient = await this.getRedisClient();
    await redisClient.setex(
      `${SESSION_REDIS_KEY_PREFIX}${SESSION_REDIS_SESSION_KEY_PREFIX}${session.id}`,
      SESSION_DURATION_IN_SECONDS,
      await encryptSessionData(session)
    );
    await redisClient.setex(
      `${SESSION_REDIS_KEY_PREFIX}${SESSION_REDIS_USER_KEY_PREFIX}${session.userId}`,
      SESSION_DURATION_IN_SECONDS,
      JSON.stringify(
        JSON.parse(
          (await redisClient.get(
            `${SESSION_REDIS_KEY_PREFIX}${SESSION_REDIS_USER_KEY_PREFIX}${session.userId}`
          )) ?? "[]"
        ).concat(session.id)
      )
    );
  }

  async updateSessionExpiration(
    sessionId: string,
    expiresAt: Date
  ): Promise<void> {
    const redisClient = await this.getRedisClient();
    const session = await redisClient.get(
      `${SESSION_REDIS_KEY_PREFIX}${SESSION_REDIS_SESSION_KEY_PREFIX}${sessionId}`
    );
    if (!session) {
      throw new Error("Session not found");
    }
    const parsedSession = await decryptSessionData(session);
    await redisClient.setex(
      `${SESSION_REDIS_KEY_PREFIX}${SESSION_REDIS_SESSION_KEY_PREFIX}${sessionId}`,
      SESSION_DURATION_IN_SECONDS,
      JSON.stringify({ ...parsedSession, expiresAt })
    );
  }

  async deleteSession(sessionId: string): Promise<void> {
    const redisClient = await this.getRedisClient();
    const session = await redisClient.get(
      `${SESSION_REDIS_KEY_PREFIX}${SESSION_REDIS_SESSION_KEY_PREFIX}${sessionId}`
    );
    if (!session) {
      return;
    }
    const userId = (await decryptSessionData(session)).userId;
    await redisClient.del(
      `${SESSION_REDIS_KEY_PREFIX}${SESSION_REDIS_SESSION_KEY_PREFIX}${sessionId}`
    );
    const sessionIds = await redisClient.get(
      `${SESSION_REDIS_KEY_PREFIX}${SESSION_REDIS_USER_KEY_PREFIX}${userId}`
    );
    if (!sessionIds) {
      return;
    }
    await redisClient.setex(
      `${SESSION_REDIS_KEY_PREFIX}${SESSION_REDIS_USER_KEY_PREFIX}${userId}`,
      SESSION_DURATION_IN_SECONDS,
      JSON.stringify(
        JSON.parse(sessionIds).filter((id: string) => id !== sessionId)
      )
    );
  }

  async deleteUserSessions(userId: string): Promise<void> {
    const redisClient = await this.getRedisClient();
    const sessionIds = await redisClient.get(
      `${SESSION_REDIS_KEY_PREFIX}${SESSION_REDIS_USER_KEY_PREFIX}${userId}`
    );
    if (!sessionIds) {
      return;
    }
    await Promise.all(
      JSON.parse(sessionIds).map((id: string) =>
        redisClient.del(
          `${SESSION_REDIS_KEY_PREFIX}${SESSION_REDIS_SESSION_KEY_PREFIX}${id}`
        )
      )
    );
    await redisClient.del(
      `${SESSION_REDIS_KEY_PREFIX}${SESSION_REDIS_USER_KEY_PREFIX}${userId}`
    );
  }

  deleteExpiredSessions(): Promise<void> {
    throw new Error(
      "Method not implemented, sessions are deleted automatically"
    );
  }

  async getSessionAndUser(
    sessionId: string
  ): Promise<[session: DatabaseSession | null, user: DatabaseUser | null]> {
    const redisClient = await this.getRedisClient();
    const session = await redisClient.get(
      `${SESSION_REDIS_KEY_PREFIX}${SESSION_REDIS_SESSION_KEY_PREFIX}${sessionId}`
    );
    if (!session) {
      return [null, null];
    }
    try {
      const parsedSession = await decryptSessionData(session);
      // Might be stored as a string, so we need to convert it to a Date
      parsedSession.expiresAt = new Date(parsedSession.expiresAt);

      const user = await redisClient.get(
        `${SESSION_REDIS_DATA_KEY_PREFIX}${SESSION_REDIS_USER_KEY_PREFIX}${parsedSession.userId}`
      );
      if (!user) {
        return [null, null];
      }
      const userProfile = JSON.parse(user);
      return [parsedSession, userProfile];
    } catch (error) {
      console.error(error, "Error while decrypting session data");
      return [null, null];
    }
  }
}

async function encryptSessionData(session: DatabaseSession) {
  if (!process.env.ENCRYPTION_SECRET_KEY) {
    return JSON.stringify(session);
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(
    ENCYPTION_ALGORITHM,
    Buffer.from(process.env.ENCRYPTION_SECRET_KEY, "hex"),
    iv
  );
  let encrypted = cipher.update(JSON.stringify(session));
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

async function decryptSessionData(encrpytedSession: string) {
  if (!process.env.ENCRYPTION_SECRET_KEY) {
    return JSON.parse(encrpytedSession);
  }
  const [iv, encryptedText] = encrpytedSession.split(":");
  const decipher = createDecipheriv(
    ENCYPTION_ALGORITHM,
    Buffer.from(process.env.ENCRYPTION_SECRET_KEY, "hex"),
    Buffer.from(iv, "hex")
  );
  let decrypted = decipher.update(Buffer.from(encryptedText, "hex"));

  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return JSON.parse(decrypted.toString());
}

export async function insertUserSession(user: DatabaseUser) {
  const redis = await getRedisClient();
  await redis.setex(
    `${SESSION_REDIS_DATA_KEY_PREFIX}${SESSION_REDIS_USER_KEY_PREFIX}${user.id}`,
    2 * SESSION_DURATION_IN_SECONDS,
    JSON.stringify({ attributes: { ...user.attributes }, id: user.id })
  );
}
