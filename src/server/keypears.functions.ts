import { createServerFn } from "@tanstack/react-start";
import {
  getCookie,
  setCookie,
  deleteCookie,
} from "@tanstack/react-start/server";
import {
  insertKeypear,
  getKeypearById,
  saveKeypear,
  verifyLogin,
} from "./keypears.server";

const COOKIE_NAME = "keypear_id";
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

export const createKeypear = createServerFn({ method: "POST" }).handler(
  async () => {
    const result = await insertKeypear();
    setCookie(COOKIE_NAME, String(result.id), cookieOpts(ONE_DAY));
    return result;
  },
);

export const getMyKeypear = createServerFn({ method: "GET" }).handler(
  async () => {
    const id = getCookie(COOKIE_NAME);
    if (!id) return null;
    const row = await getKeypearById(Number(id));
    if (!row) return null;
    // Check if expired
    if (row.expiresAt && row.expiresAt < new Date()) return null;
    return { id: row.id, hasPassword: row.passwordHash != null };
  },
);

export const getOrCreateKeypear = createServerFn({ method: "GET" }).handler(
  async () => {
    const id = getCookie(COOKIE_NAME);
    if (id) {
      const row = await getKeypearById(Number(id));
      if (row && (!row.expiresAt || row.expiresAt >= new Date())) {
        return { id: row.id, hasPassword: row.passwordHash != null };
      }
    }
    const result = await insertKeypear();
    setCookie(COOKIE_NAME, String(result.id), cookieOpts(ONE_DAY));
    return { id: result.id, hasPassword: false };
  },
);

export const saveMyKeypear = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      loginKey: string;
      publicKey: string;
      encryptedPrivateKey: string;
    }) => data,
  )
  .handler(async ({ data: input }) => {
    const id = getCookie(COOKIE_NAME);
    if (!id) throw new Error("Not logged in");
    const row = await getKeypearById(Number(id));
    if (!row) throw new Error("Keypear not found");
    if (row.passwordHash) throw new Error("Already saved");
    await saveKeypear(
      row.id,
      input.loginKey,
      input.publicKey,
      input.encryptedPrivateKey,
    );
    setCookie(COOKIE_NAME, String(row.id), cookieOpts(TWO_YEARS));
    return { success: true };
  });

export const login = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; loginKey: string }) => data)
  .handler(async ({ data: input }) => {
    const result = await verifyLogin(input.id, input.loginKey);
    setCookie(COOKIE_NAME, String(result.id), cookieOpts(TWO_YEARS));
    return { id: result.id };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  deleteCookie(COOKIE_NAME);
  return { success: true };
});

export const getProfile = createServerFn({ method: "GET" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const row = await getKeypearById(id);
    if (!row) return null;
    return {
      id: row.id,
      publicKey: row.publicKey,
      createdAt: row.createdAt,
    };
  });
