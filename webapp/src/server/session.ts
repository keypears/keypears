import { getCookie } from "@tanstack/react-start/server";
import { resolveSession } from "./user.server";

const COOKIE_NAME = "session";

/** Read session cookie, resolve to user ID. Returns null if invalid/expired. */
export async function getSessionUserId(): Promise<string | null> {
  const token = getCookie(COOKIE_NAME);
  if (!token) return null;
  return resolveSession(token);
}

/** Read session cookie, resolve to user ID. Throws if not logged in. */
export async function requireSessionUserId(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("Not logged in");
  return userId;
}

export { COOKIE_NAME };
