import { createServerFn } from "@tanstack/react-start";
import {
  getCookie,
  setCookie,
  deleteCookie,
} from "@tanstack/react-start/server";
import {
  insertUser,
  getUserById,
  getUserByName,
  saveUser,
  verifyLogin,
  getActiveKey,
  insertKey,
  getRecentKeys,
  deleteUnsavedUser,
  insertPowLog,
  getUserPowTotal,
  getAllEncryptedKeys,
  changePassword,
  createSession,
  resolveSession,
  deleteSession,
  deleteAllSessions,
  deleteAllSessionsExcept,
} from "./user.server";
import { REGISTRATION_DIFFICULTY } from "./pow.server";
import { verifyAndConsumePow } from "./pow.consume";
import { PowSolutionSchema, nameSchema } from "./schemas";
import { z } from "zod";
import { blake3Hash } from "@webbuf/blake3";
import { WebBuf } from "@webbuf/webbuf";

const COOKIE_NAME = "session";
const ONE_DAY = 60 * 60 * 24;
const THIRTY_DAYS = 60 * 60 * 24 * 30;

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge,
    path: "/",
  };
}

/** Read session cookie, resolve to user ID. Returns null if invalid/expired. */
async function getSessionUserId(): Promise<string | null> {
  const token = getCookie(COOKIE_NAME);
  if (!token) return null;
  return resolveSession(token);
}

/** Read session cookie, resolve to user ID. Throws if not logged in. */
async function requireSessionUserId(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("Not logged in");
  return userId;
}

/** Hash the current session token to identify it in the sessions table. */
function hashCurrentToken(): string | null {
  const token = getCookie(COOKIE_NAME);
  if (!token) return null;
  return blake3Hash(WebBuf.fromHex(token)).buf.toHex();
}

export const createUser = createServerFn({ method: "POST" })
  .inputValidator(PowSolutionSchema)
  .handler(async ({ data: pow }) => {
    const powResult = await verifyAndConsumePow(
      pow.solvedHeader,
      pow.target,
      pow.expiresAt,
      pow.signature,
    );
    if (!powResult.valid) {
      throw new Error(`Invalid proof of work: ${powResult.message}`);
    }
    const result = await insertUser();
    await insertPowLog(result.id, "pow5-64b", REGISTRATION_DIFFICULTY);
    const session = await createSession(result.id, ONE_DAY);
    setCookie(COOKIE_NAME, session.token, cookieOpts(ONE_DAY));
    return result;
  });

export const getMyUser = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const row = await getUserById(userId);
  if (!row) return null;
  if (row.expiresAt && row.expiresAt < new Date()) return null;
  return {
    id: row.id,
    name: row.name,
    hasPassword: row.passwordHash != null,
  };
});

export const getOrCreateUser = createServerFn({ method: "GET" }).handler(
  async () => {
    const userId = await getSessionUserId();
    if (userId) {
      const row = await getUserById(userId);
      if (row && (!row.expiresAt || row.expiresAt >= new Date())) {
        return {
          id: row.id,
          name: row.name,
          hasPassword: row.passwordHash != null,
        };
      }
    }
    const result = await insertUser();
    const session = await createSession(result.id, ONE_DAY);
    setCookie(COOKIE_NAME, session.token, cookieOpts(ONE_DAY));
    return { id: result.id, name: null, hasPassword: false };
  },
);

export const checkNameAvailable = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data: name }) => {
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      return { available: false, error: parsed.error.issues[0]?.message };
    }
    const existing = await getUserByName(name);
    return { available: !existing, error: null };
  });

export const saveMyUser = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: nameSchema,
      loginKey: z.string(),
      publicKey: z.string(),
      encryptedPrivateKey: z.string(),
    }),
  )
  .handler(async ({ data: input }) => {
    const userId = await requireSessionUserId();
    const row = await getUserById(userId);
    if (!row) throw new Error("User not found");
    if (row.passwordHash) throw new Error("Already saved");
    await saveUser(
      row.id,
      input.name,
      input.loginKey,
      input.publicKey,
      input.encryptedPrivateKey,
    );
    // Replace the 1-day session with a 30-day session
    const token = getCookie(COOKIE_NAME);
    if (token) await deleteSession(token);
    const session = await createSession(row.id, THIRTY_DAYS);
    setCookie(COOKIE_NAME, session.token, cookieOpts(THIRTY_DAYS));
    return { success: true };
  });

export const deleteMyUser = createServerFn({ method: "POST" }).handler(
  async () => {
    const userId = await requireSessionUserId();
    await deleteAllSessions(userId);
    await deleteUnsavedUser(userId);
    deleteCookie(COOKIE_NAME);
    return { success: true };
  },
);

export const login = createServerFn({ method: "POST" })
  .inputValidator(
    z
      .object({
        name: z.string(),
        loginKey: z.string(),
      })
      .and(PowSolutionSchema),
  )
  .handler(async ({ data: input }) => {
    const powResult = await verifyAndConsumePow(
      input.solvedHeader,
      input.target,
      input.expiresAt,
      input.signature,
    );
    if (!powResult.valid) {
      throw new Error(`Invalid proof of work: ${powResult.message}`);
    }
    const result = await verifyLogin(input.name, input.loginKey);
    const session = await createSession(result.id, THIRTY_DAYS);
    setCookie(COOKIE_NAME, session.token, cookieOpts(THIRTY_DAYS));
    return { id: result.id };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const token = getCookie(COOKIE_NAME);
  if (token) await deleteSession(token);
  deleteCookie(COOKIE_NAME);
  return { success: true };
});

export const rotateKey = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      publicKey: z.string(),
      encryptedPrivateKey: z.string(),
    }),
  )
  .handler(async ({ data: input }) => {
    const userId = await requireSessionUserId();
    const row = await getUserById(userId);
    if (!row) throw new Error("User not found");
    if (!row.passwordHash) throw new Error("Account not saved");
    const result = await insertKey(
      row.id,
      input.publicKey,
      input.encryptedPrivateKey,
    );
    return { keyNumber: result.keyNumber };
  });

export const getMyKeys = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await getSessionUserId();
  if (!userId) return [];
  return getRecentKeys(userId, 10);
});

export const getProfile = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data: name }) => {
    const row = await getUserByName(name);
    if (!row) return null;
    const [activeKey, powTotal] = await Promise.all([
      getActiveKey(row.id),
      getUserPowTotal(row.id),
    ]);
    return {
      name: row.name,
      publicKey: activeKey?.publicKey ?? null,
      powTotal: powTotal.toString(),
      createdAt: row.createdAt,
    };
  });

export const getMyEncryptedKeys = createServerFn({ method: "GET" }).handler(
  async () => {
    const userId = await requireSessionUserId();
    return getAllEncryptedKeys(userId);
  },
);

export const changeMyPassword = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      newLoginKey: z.string(),
      reEncryptedKeys: z.array(
        z.object({
          id: z.string(),
          encryptedPrivateKey: z.string(),
        }),
      ),
    }),
  )
  .handler(async ({ data: input }) => {
    const userId = await requireSessionUserId();
    const row = await getUserById(userId);
    if (!row) throw new Error("User not found");
    if (!row.passwordHash) throw new Error("Account not saved");
    await changePassword(row.id, input.newLoginKey, input.reEncryptedKeys);
    // Revoke all other sessions
    const currentHash = hashCurrentToken();
    if (currentHash) {
      await deleteAllSessionsExcept(row.id, currentHash);
    }
    return { success: true };
  });
