import { createServerFn } from "@tanstack/react-start";
import {
  getCookie,
  setCookie,
  deleteCookie,
} from "@tanstack/react-start/server";
import {
  insertUser,
  getUserById,
  getUserByNameAndDomain,
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
  reEncryptKey,
  createSession,
  deleteSession,
  deleteAllSessions,
  deleteAllSessionsExcept,
  getOrCreateDomain,
  getDomainByName,
  getDomainById,
  getDomainsForAdmin,
  getUsersForDomain,
  claimDomain,
  createUserForDomain,
  resetUserPassword,
  getPrimaryDomain,
  toggleOpenRegistration,
  toggleAllowThirdPartyDomains,
  updatePowSettings,
  getUserPowSettings,
  getPowHistory,
} from "./user.server";
import { verifyDomainAdmin } from "./federation.server";
import { REGISTRATION_DIFFICULTY, LOGIN_DIFFICULTY } from "./pow.server";
import { verifyAndConsumePow } from "./pow.consume";
import { PowSolutionSchema, nameSchema } from "./schemas";
import { getSessionUserId, COOKIE_NAME } from "./session";
import { authMiddleware } from "./auth-middleware";
import { z } from "zod";
import { sha256Hash } from "@webbuf/sha256";
import { WebBuf } from "@webbuf/webbuf";
import { getDomain, makeAddress, parseAddress } from "~/lib/config";

const ONE_DAY = 60 * 60 * 24;
const THIRTY_DAYS = 60 * 60 * 24 * 30;

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    maxAge,
    path: "/",
  };
}

// Options for clearing the session cookie. Browsers enforce the
// `__Host-` prefix requirements (Secure, Path=/, no Domain) on every
// Set-Cookie line, so a deletion that omits Secure or Path is rejected
// outright and the original cookie persists. These options must mirror
// `cookieOpts` for the deletion to actually take effect.
const COOKIE_DELETE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};

/** Hash the current session token to identify it in the sessions table. */
function hashCurrentToken(): string | null {
  const token = getCookie(COOKIE_NAME);
  if (!token) return null;
  return sha256Hash(WebBuf.fromHex(token)).buf.toHex();
}

export const createUser = createServerFn({ method: "POST" })
  .inputValidator(PowSolutionSchema)
  .handler(async ({ data: pow }) => {
    // Check if open registration is allowed
    const primaryDomain = await getPrimaryDomain();
    if (primaryDomain && !primaryDomain.openRegistration) {
      throw new Error("Registration is closed. Contact the administrator.");
    }
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
  let userDomain: string | null = null;
  if (row.domainId) {
    const d = await getDomainById(row.domainId);
    if (d) userDomain = d.domain;
  }
  return {
    id: row.id,
    name: row.name,
    domain: userDomain,
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
  .inputValidator(
    z.object({
      name: z.string(),
      domain: z.string(),
    }),
  )
  .handler(async ({ data: input }) => {
    const parsed = nameSchema.safeParse(input.name);
    if (!parsed.success) {
      return { available: false, error: parsed.error.issues[0]?.message };
    }
    const domain = await getDomainByName(input.domain);
    if (!domain) {
      // Primary domain may not exist in DB yet (first startup)
      if (input.domain === getDomain()) {
        return { available: true, error: null };
      }
      return { available: false, error: "Domain not hosted on this server" };
    }
    if (!domain.openRegistration) {
      return {
        available: false,
        error: "Registration is closed for this domain",
      };
    }
    const existing = await getUserByNameAndDomain(input.name, domain.id);
    return { available: !existing, error: null };
  });

// Sibling of `checkNameAvailable` for the admin add-user form on the
// domains page. Same name-validity + uniqueness checks, but authorized
// by domain ownership instead of by the openRegistration flag:
// `openRegistration` only governs anonymous self-signup, not admin-
// driven user creation. The verified domain admin can create users
// regardless of whether public signup is open.
export const adminCheckNameAvailable = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      name: z.string(),
      domain: z.string(),
    }),
  )
  .middleware([authMiddleware])
  .handler(async ({ data: input, context: { userId } }) => {
    const parsed = nameSchema.safeParse(input.name);
    if (!parsed.success) {
      return { available: false, error: parsed.error.issues[0]?.message };
    }
    const adminAddress = await getMyAddress(userId);
    const result = await verifyDomainAdmin(input.domain, adminAddress);
    if (!result.valid) {
      return { available: false, error: result.message ?? "Not authorized" };
    }
    const domain = await getDomainByName(input.domain);
    if (!domain) {
      return { available: false, error: "Domain not found" };
    }
    const existing = await getUserByNameAndDomain(input.name, domain.id);
    return { available: !existing, error: null };
  });

export const saveMyUser = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: nameSchema,
      domain: z.string(),
      loginKey: z.string(),
      signingPublicKey: z.string(),
      encapPublicKey: z.string(),
      encryptedSigningKey: z.string(),
      encryptedDecapKey: z.string(),
    }),
  )
  .middleware([authMiddleware])
  .handler(async ({ data: input, context: { userId } }) => {
    const row = await getUserById(userId);
    if (!row) throw new Error("User not found");
    if (row.passwordHash) throw new Error("Already saved");
    const domain = await getOrCreateDomain(input.domain);
    await saveUser(
      row.id,
      input.name,
      domain.id,
      input.loginKey,
      WebBuf.fromHex(input.signingPublicKey),
      WebBuf.fromHex(input.encapPublicKey),
      WebBuf.fromHex(input.encryptedSigningKey),
      WebBuf.fromHex(input.encryptedDecapKey),
    );
    // Replace the 1-day session with a 30-day session
    const token = getCookie(COOKIE_NAME);
    if (token) await deleteSession(token);
    const session = await createSession(row.id, THIRTY_DAYS);
    setCookie(COOKIE_NAME, session.token, cookieOpts(THIRTY_DAYS));
    return { success: true };
  });

export const deleteMyUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context: { userId } }) => {
    await deleteAllSessions(userId);
    await deleteUnsavedUser(userId);
    deleteCookie(COOKIE_NAME, COOKIE_DELETE_OPTS);
    return { success: true };
  });

export const login = createServerFn({ method: "POST" })
  .inputValidator(
    z
      .object({
        name: z.string(),
        domain: z.string(),
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
    const domain = await getDomainByName(input.domain);
    if (!domain) throw new Error("Invalid credentials");
    const result = await verifyLogin(input.name, domain.id, input.loginKey);
    await insertPowLog(result.id, "pow5-64b", LOGIN_DIFFICULTY);
    const session = await createSession(result.id, THIRTY_DAYS);
    setCookie(COOKIE_NAME, session.token, cookieOpts(THIRTY_DAYS));
    return { id: result.id };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const token = getCookie(COOKIE_NAME);
  if (token) await deleteSession(token);
  deleteCookie(COOKIE_NAME, COOKIE_DELETE_OPTS);
  return { success: true };
});

export const rotateKey = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      signingPublicKey: z.string(),
      encapPublicKey: z.string(),
      encryptedSigningKey: z.string(),
      encryptedDecapKey: z.string(),
    }),
  )
  .middleware([authMiddleware])
  .handler(async ({ data: input, context: { userId } }) => {
    const row = await getUserById(userId);
    if (!row) throw new Error("User not found");
    if (!row.passwordHash) throw new Error("Account not saved");
    const result = await insertKey(
      row.id,
      WebBuf.fromHex(input.signingPublicKey),
      WebBuf.fromHex(input.encapPublicKey),
      WebBuf.fromHex(input.encryptedSigningKey),
      WebBuf.fromHex(input.encryptedDecapKey),
      row.passwordHash,
    );
    return { keyNumber: result.keyNumber };
  });

export const getMyKeys = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await getSessionUserId();
  if (!userId) return { keys: [], passwordHash: null };
  const user = await getUserById(userId);
  if (!user) return { keys: [], passwordHash: null };
  const keyList = await getRecentKeys(userId, 100);
  return {
    keys: keyList.map((k) => ({
      ...k,
      signingPublicKey: k.signingPublicKey.toHex(),
      encapPublicKey: k.encapPublicKey.toHex(),
      encryptedSigningKey: k.encryptedSigningKey.toHex(),
      encryptedDecapKey: k.encryptedDecapKey.toHex(),
    })),
    passwordHash: user.passwordHash,
  };
});

export const getProfile = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data: address }) => {
    const parsed = parseAddress(address);
    if (!parsed) return null;
    const domain = await getDomainByName(parsed.domain);
    if (!domain) return null;
    const row = await getUserByNameAndDomain(parsed.name, domain.id);
    if (!row) return null;
    const [activeKey, powTotal] = await Promise.all([
      getActiveKey(row.id),
      getUserPowTotal(row.id),
    ]);
    return {
      name: row.name,
      signingPublicKey: activeKey?.signingPublicKey.toHex() ?? null,
      powTotal: powTotal.toString(),
      createdAt: row.createdAt,
    };
  });

export const getPowHistoryForAddress = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      address: z.string(),
      beforeId: z.string().optional(),
    }),
  )
  .handler(async ({ data: input }) => {
    const parsed = parseAddress(input.address);
    if (!parsed) return [];
    const domain = await getDomainByName(parsed.domain);
    if (!domain) return [];
    const row = await getUserByNameAndDomain(parsed.name, domain.id);
    if (!row) return [];
    const history = await getPowHistory(row.id, 20, input.beforeId);
    return history.map((h) => ({
      id: h.id,
      difficulty: h.difficulty.toString(),
      createdAt: h.createdAt,
    }));
  });

export const getMyEncryptedKeys = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context: { userId } }) => {
    const rows = await getAllEncryptedKeys(userId);
    return rows.map((k) => ({
      ...k,
      encryptedSigningKey: k.encryptedSigningKey.toHex(),
      encryptedDecapKey: k.encryptedDecapKey.toHex(),
    }));
  });

export const changeMyPassword = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      newLoginKey: z.string(),
      reEncryptedKeys: z.array(
        z.object({
          id: z.string(),
          encryptedSigningKey: z.string(),
          encryptedDecapKey: z.string(),
        }),
      ),
    }),
  )
  .middleware([authMiddleware])
  .handler(async ({ data: input, context: { userId } }) => {
    const row = await getUserById(userId);
    if (!row) throw new Error("User not found");
    if (!row.passwordHash) throw new Error("Account not saved");
    await changePassword(
      row.id,
      input.newLoginKey,
      input.reEncryptedKeys.map((k) => ({
        id: k.id,
        encryptedSigningKey: WebBuf.fromHex(k.encryptedSigningKey),
        encryptedDecapKey: WebBuf.fromHex(k.encryptedDecapKey),
      })),
    );
    // Revoke all other sessions
    const currentHash = hashCurrentToken();
    if (currentHash) {
      await deleteAllSessionsExcept(row.id, currentHash);
    }
    return { success: true };
  });

export const reEncryptMyKey = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      keyId: z.string(),
      encryptedSigningKey: z.string(),
      encryptedDecapKey: z.string(),
      loginKey: z.string(),
    }),
  )
  .middleware([authMiddleware])
  .handler(async ({ data: input, context: { userId } }) => {
    await reEncryptKey(
      userId,
      input.keyId,
      WebBuf.fromHex(input.encryptedSigningKey),
      WebBuf.fromHex(input.encryptedDecapKey),
      input.loginKey,
    );
    return { success: true };
  });

// --- Domain management ---

async function getMyAddress(userId: string): Promise<string> {
  const user = await getUserById(userId);
  if (!user?.name || !user.domainId) throw new Error("Account not saved");
  const domain = await getDomainById(user.domainId);
  if (!domain) throw new Error("Domain not found");
  return makeAddress(user.name, domain.domain);
}

export const claimDomainFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: domainName, context: { userId } }) => {
    // Check if third-party domain hosting is allowed
    const primaryDomain = await getPrimaryDomain();
    if (primaryDomain && !primaryDomain.allowThirdPartyDomains) {
      throw new Error("Third-party domain hosting is disabled.");
    }
    const adminAddress = await getMyAddress(userId);
    const result = await verifyDomainAdmin(domainName, adminAddress);
    if (!result.valid) throw new Error(result.message ?? "Verification failed");
    const domain = await claimDomain(domainName, userId);
    return { id: domain.id, domain: domain.domain };
  });

export const getMyDomains = createServerFn({ method: "GET" }).handler(
  async () => {
    const userId = await getSessionUserId();
    if (!userId) return [];
    return getDomainsForAdmin(userId);
  },
);

export const getDomainUsersFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: domainName, context: { userId } }) => {
    const adminAddress = await getMyAddress(userId);
    const result = await verifyDomainAdmin(domainName, adminAddress);
    if (!result.valid) throw new Error(result.message ?? "Not authorized");
    const domain = await getDomainByName(domainName);
    if (!domain) throw new Error("Domain not found");
    return getUsersForDomain(domain.id);
  });

export const createDomainUserFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      domain: z.string(),
      name: nameSchema,
      loginKey: z.string(),
      signingPublicKey: z.string(),
      encapPublicKey: z.string(),
      encryptedSigningKey: z.string(),
      encryptedDecapKey: z.string(),
    }),
  )
  .middleware([authMiddleware])
  .handler(async ({ data: input, context: { userId } }) => {
    const adminAddress = await getMyAddress(userId);
    const result = await verifyDomainAdmin(input.domain, adminAddress);
    if (!result.valid) throw new Error(result.message ?? "Not authorized");
    const domain = await getDomainByName(input.domain);
    if (!domain) throw new Error("Domain not found");
    return createUserForDomain(
      input.name,
      domain.id,
      input.loginKey,
      WebBuf.fromHex(input.signingPublicKey),
      WebBuf.fromHex(input.encapPublicKey),
      WebBuf.fromHex(input.encryptedSigningKey),
      WebBuf.fromHex(input.encryptedDecapKey),
    );
  });

export const resetDomainUserPasswordFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      domain: z.string(),
      userId: z.string(),
      newLoginKey: z.string(),
      signingPublicKey: z.string(),
      encapPublicKey: z.string(),
      encryptedSigningKey: z.string(),
      encryptedDecapKey: z.string(),
    }),
  )
  .middleware([authMiddleware])
  .handler(async ({ data: input, context: { userId } }) => {
    const adminAddress = await getMyAddress(userId);
    const result = await verifyDomainAdmin(input.domain, adminAddress);
    if (!result.valid) throw new Error(result.message ?? "Not authorized");
    await resetUserPassword(
      input.userId,
      input.newLoginKey,
      WebBuf.fromHex(input.signingPublicKey),
      WebBuf.fromHex(input.encapPublicKey),
      WebBuf.fromHex(input.encryptedSigningKey),
      WebBuf.fromHex(input.encryptedDecapKey),
    );
    return { success: true };
  });

export const isRegistrationOpen = createServerFn({ method: "GET" }).handler(
  async () => {
    const primaryDomain = await getPrimaryDomain();
    if (!primaryDomain) return true; // No domain yet = first boot, allow
    return primaryDomain.openRegistration;
  },
);

export const toggleOpenRegistrationFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      domain: z.string(),
      value: z.boolean(),
    }),
  )
  .handler(async ({ data: input, context: { userId } }) => {
    const adminAddress = await getMyAddress(userId);
    const result = await verifyDomainAdmin(input.domain, adminAddress);
    if (!result.valid) throw new Error(result.message ?? "Not authorized");
    const domain = await getDomainByName(input.domain);
    if (!domain) throw new Error("Domain not found");
    await toggleOpenRegistration(domain.id, input.value);
    return { success: true };
  });

export const toggleAllowThirdPartyDomainsFn = createServerFn({
  method: "POST",
})
  .middleware([authMiddleware])
  .inputValidator(z.boolean())
  .handler(async ({ data: value, context: { userId } }) => {
    const adminAddress = await getMyAddress(userId);
    const primaryDomain = await getPrimaryDomain();
    if (!primaryDomain) throw new Error("Primary domain not configured");
    const result = await verifyDomainAdmin(primaryDomain.domain, adminAddress);
    if (!result.valid) throw new Error(result.message ?? "Not authorized");
    await toggleAllowThirdPartyDomains(primaryDomain.id, value);
    return { success: true };
  });

// --- PoW settings ---

export const getMyPowSettings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context: { userId } }) => {
    const settings = await getUserPowSettings(userId);
    return {
      channelDifficulty: settings?.channelDifficulty?.toString() ?? null,
      messageDifficulty: settings?.messageDifficulty?.toString() ?? null,
    };
  });

export const updateMyPowSettings = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      channelDifficulty: z.string(),
      messageDifficulty: z.string(),
    }),
  )
  .middleware([authMiddleware])
  .handler(async ({ data: input, context: { userId } }) => {
    await updatePowSettings(
      userId,
      BigInt(input.channelDifficulty),
      BigInt(input.messageDifficulty),
    );
    return { success: true };
  });
