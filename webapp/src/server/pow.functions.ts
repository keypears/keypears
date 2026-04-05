import { createServerFn } from "@tanstack/react-start";
import {
  createPowChallenge,
  verifyPowSolution,
  LOGIN_DIFFICULTY,
  CHANNEL_DIFFICULTY,
} from "./pow.server";
import { PowSolutionSchema } from "./schemas";

export const getPowChallenge = createServerFn({ method: "GET" }).handler(
  async () => {
    return createPowChallenge();
  },
);

export const getLoginPowChallenge = createServerFn({ method: "GET" }).handler(
  async () => {
    return createPowChallenge(LOGIN_DIFFICULTY);
  },
);

export const getChannelPowChallenge = createServerFn({ method: "GET" }).handler(
  async () => {
    return createPowChallenge(CHANNEL_DIFFICULTY);
  },
);

export const verifyPow = createServerFn({ method: "POST" })
  .inputValidator(PowSolutionSchema)
  .handler(async ({ data }) => {
    return verifyPowSolution(
      data.solvedHeader,
      data.target,
      data.expiresAt,
      data.signature,
    );
  });
