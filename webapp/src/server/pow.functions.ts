import { createServerFn } from "@tanstack/react-start";
import {
  createPowChallenge,
  verifyPowSolution,
  LOGIN_DIFFICULTY,
} from "./pow.server";

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

export const verifyPow = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      solvedHeader: string;
      target: string;
      expiresAt: number;
      signature: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    return verifyPowSolution(
      data.solvedHeader,
      data.target,
      data.expiresAt,
      data.signature,
    );
  });
