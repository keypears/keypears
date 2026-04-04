import { createServerFn } from "@tanstack/react-start";
import {
  getCookie,
  setCookie,
  deleteCookie,
} from "@tanstack/react-start/server";
import {
  insertUser,
  getUserById,
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
} from "./user.server";
import { verifyPowSolution, REGISTRATION_DIFFICULTY } from "./pow.server";
import { PowSolutionSchema } from "./schemas";
import { z } from "zod";

const COOKIE_NAME = "user_id";
const ONE_DAY = 60 * 60 * 24;
const TWO_YEARS = 60 * 60 * 24 * 365 * 2;

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge,
    path: "/",
  };
}

export const createUser = createServerFn({ method: "POST" })
  .inputValidator(PowSolutionSchema)
  .handler(async ({ data: pow }) => {
    const powResult = verifyPowSolution(
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
    setCookie(COOKIE_NAME, String(result.id), cookieOpts(ONE_DAY));
    return result;
  });

export const getMyUser = createServerFn({ method: "GET" }).handler(async () => {
  const id = getCookie(COOKIE_NAME);
  if (!id) return null;
  const row = await getUserById(Number(id));
  if (!row) return null;
  if (row.expiresAt && row.expiresAt < new Date()) return null;
  return { id: row.id, hasPassword: row.passwordHash != null };
});

export const getOrCreateUser = createServerFn({ method: "GET" }).handler(
  async () => {
    const id = getCookie(COOKIE_NAME);
    if (id) {
      const row = await getUserById(Number(id));
      if (row && (!row.expiresAt || row.expiresAt >= new Date())) {
        return { id: row.id, hasPassword: row.passwordHash != null };
      }
    }
    const result = await insertUser();
    setCookie(COOKIE_NAME, String(result.id), cookieOpts(ONE_DAY));
    return { id: result.id, hasPassword: false };
  },
);

export const saveMyUser = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      loginKey: z.string(),
      publicKey: z.string(),
      encryptedPrivateKey: z.string(),
    }),
  )
  .handler(async ({ data: input }) => {
    const id = getCookie(COOKIE_NAME);
    if (!id) throw new Error("Not logged in");
    const row = await getUserById(Number(id));
    if (!row) throw new Error("User not found");
    if (row.passwordHash) throw new Error("Already saved");
    await saveUser(
      row.id,
      input.loginKey,
      input.publicKey,
      input.encryptedPrivateKey,
    );
    setCookie(COOKIE_NAME, String(row.id), cookieOpts(TWO_YEARS));
    return { success: true };
  });

export const deleteMyUser = createServerFn({ method: "POST" }).handler(
  async () => {
    const id = getCookie(COOKIE_NAME);
    if (!id) throw new Error("Not logged in");
    await deleteUnsavedUser(Number(id));
    deleteCookie(COOKIE_NAME);
    return { success: true };
  },
);

export const login = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.number(),
      loginKey: z.string(),
    }).and(PowSolutionSchema),
  )
  .handler(async ({ data: input }) => {
    const powResult = verifyPowSolution(
      input.solvedHeader,
      input.target,
      input.expiresAt,
      input.signature,
    );
    if (!powResult.valid) {
      throw new Error(`Invalid proof of work: ${powResult.message}`);
    }
    const result = await verifyLogin(input.id, input.loginKey);
    setCookie(COOKIE_NAME, String(result.id), cookieOpts(TWO_YEARS));
    return { id: result.id };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
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
    const id = getCookie(COOKIE_NAME);
    if (!id) throw new Error("Not logged in");
    const row = await getUserById(Number(id));
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
  const id = getCookie(COOKIE_NAME);
  if (!id) return [];
  return getRecentKeys(Number(id), 10);
});

export const getProfile = createServerFn({ method: "GET" })
  .inputValidator(z.number())
  .handler(async ({ data: id }) => {
    const row = await getUserById(id);
    if (!row) return null;
    const [activeKey, powTotal] = await Promise.all([
      getActiveKey(id),
      getUserPowTotal(id),
    ]);
    return {
      id: row.id,
      publicKey: activeKey?.publicKey ?? null,
      powTotal: powTotal.toString(),
      createdAt: row.createdAt,
    };
  });

export const getMyEncryptedKeys = createServerFn({ method: "GET" }).handler(
  async () => {
    const id = getCookie(COOKIE_NAME);
    if (!id) throw new Error("Not logged in");
    return getAllEncryptedKeys(Number(id));
  },
);

export const changeMyPassword = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      newLoginKey: z.string(),
      reEncryptedKeys: z.array(
        z.object({
          id: z.number(),
          encryptedPrivateKey: z.string(),
        }),
      ),
    }),
  )
  .handler(async ({ data: input }) => {
    const id = getCookie(COOKIE_NAME);
    if (!id) throw new Error("Not logged in");
    const row = await getUserById(Number(id));
    if (!row) throw new Error("User not found");
    if (!row.passwordHash) throw new Error("Account not saved");
    await changePassword(row.id, input.newLoginKey, input.reEncryptedKeys);
    return { success: true };
  });
