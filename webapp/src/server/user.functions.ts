import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
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
} from "./user.server";
import { verifyDomainAdmin } from "./federation.server";
import { REGISTRATION_DIFFICULTY, LOGIN_DIFFICULTY } from "./pow.server";
import { verifyAndConsumePow } from "./pow.consume";
import { PowSolutionSchema, nameSchema } from "./schemas";
import { getSessionUserId, requireSessionUserId, COOKIE_NAME } from "./session";
import { z } from "zod";
import { blake3Hash } from "@webbuf/blake3";
import { WebBuf } from "@webbuf/webbuf";
import { getDomain, makeAddress, parseAddress } from "~/lib/config";

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

/** Hash the current session token to identify it in the sessions table. */
function hashCurrentToken(): string | null {
  const token = getCookie(COOKIE_NAME);
  if (!token) return null;
  return blake3Hash(WebBuf.fromHex(token)).buf.toHex();
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
      return { available: false, error: "Registration is closed for this domain" };
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
      publicKey: z.string(),
      encryptedPrivateKey: z.string(),
    }),
  )
  .handler(async ({ data: input }) => {
    const userId = await requireSessionUserId();
    const row = await getUserById(userId);
    if (!row) throw new Error("User not found");
    if (row.passwordHash) throw new Error("Already saved");
    const domain = await getOrCreateDomain(input.domain);
    await saveUser(
      row.id,
      input.name,
      domain.id,
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
  return { keys: keyList, passwordHash: user.passwordHash };
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

export const reEncryptMyKey = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      keyId: z.string(),
      encryptedPrivateKey: z.string(),
      loginKey: z.string(),
    }),
  )
  .handler(async ({ data: input }) => {
    const userId = await requireSessionUserId();
    await reEncryptKey(
      userId,
      input.keyId,
      input.encryptedPrivateKey,
      input.loginKey,
    );
    return { success: true };
  });

// --- Domain management ---

async function getMyAddress(): Promise<string> {
  const userId = await requireSessionUserId();
  const user = await getUserById(userId);
  if (!user?.name || !user.domainId) throw new Error("Account not saved");
  const domain = await getDomainById(user.domainId);
  if (!domain) throw new Error("Domain not found");
  return makeAddress(user.name, domain.domain);
}

export const claimDomainFn = createServerFn({ method: "POST" })
  .inputValidator(z.string())
  .handler(async ({ data: domainName }) => {
    // Check if third-party domain hosting is allowed
    const primaryDomain = await getPrimaryDomain();
    if (primaryDomain && !primaryDomain.allowThirdPartyDomains) {
      throw new Error("Third-party domain hosting is disabled.");
    }
    const userId = await requireSessionUserId();
    const adminAddress = await getMyAddress();
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
  .inputValidator(z.string())
  .handler(async ({ data: domainName }) => {
    const adminAddress = await getMyAddress();
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
      publicKey: z.string(),
      encryptedPrivateKey: z.string(),
    }),
  )
  .handler(async ({ data: input }) => {
    const adminAddress = await getMyAddress();
    const result = await verifyDomainAdmin(input.domain, adminAddress);
    if (!result.valid) throw new Error(result.message ?? "Not authorized");
    const domain = await getDomainByName(input.domain);
    if (!domain) throw new Error("Domain not found");
    return createUserForDomain(
      input.name,
      domain.id,
      input.loginKey,
      input.publicKey,
      input.encryptedPrivateKey,
    );
  });

export const resetDomainUserPasswordFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      domain: z.string(),
      userId: z.string(),
      newLoginKey: z.string(),
      publicKey: z.string(),
      encryptedPrivateKey: z.string(),
    }),
  )
  .handler(async ({ data: input }) => {
    const adminAddress = await getMyAddress();
    const result = await verifyDomainAdmin(input.domain, adminAddress);
    if (!result.valid) throw new Error(result.message ?? "Not authorized");
    await resetUserPassword(
      input.userId,
      input.newLoginKey,
      input.publicKey,
      input.encryptedPrivateKey,
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
  .inputValidator(
    z.object({
      domain: z.string(),
      value: z.boolean(),
    }),
  )
  .handler(async ({ data: input }) => {
    const adminAddress = await getMyAddress();
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
  .inputValidator(z.boolean())
  .handler(async ({ data: value }) => {
    const adminAddress = await getMyAddress();
    const primaryDomain = await getPrimaryDomain();
    if (!primaryDomain) throw new Error("Primary domain not configured");
    const result = await verifyDomainAdmin(
      primaryDomain.domain,
      adminAddress,
    );
    if (!result.valid) throw new Error(result.message ?? "Not authorized");
    await toggleAllowThirdPartyDomains(primaryDomain.id, value);
    return { success: true };
  });

// --- PoW settings ---

export const getMyPowSettings = createServerFn({ method: "GET" }).handler(
  async () => {
    const userId = await requireSessionUserId();
    const settings = await getUserPowSettings(userId);
    return {
      channelDifficulty: settings?.channelDifficulty?.toString() ?? null,
      messageDifficulty: settings?.messageDifficulty?.toString() ?? null,
    };
  },
);

export const updateMyPowSettings = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      channelDifficulty: z.string(),
      messageDifficulty: z.string(),
    }),
  )
  .handler(async ({ data: input }) => {
    const userId = await requireSessionUserId();
    await updatePowSettings(
      userId,
      BigInt(input.channelDifficulty),
      BigInt(input.messageDifficulty),
    );
    return { success: true };
  });
