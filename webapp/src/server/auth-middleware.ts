import { createMiddleware } from "@tanstack/react-start";
import { getSessionUserId } from "./session";

export const authMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const userId = await getSessionUserId();
    if (!userId) throw new Error("Not logged in");
    return next({ context: { userId } });
  },
);
