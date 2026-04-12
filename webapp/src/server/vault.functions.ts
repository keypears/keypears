import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "./auth-middleware";
import {
  createVaultEntry,
  createNewVersion,
  getVaultEntries,
  getVaultEntry,
  deleteVersion,
  deleteSecret,
  getSecretHistory,
} from "./vault.server";

const MAX_ENCRYPTED_DATA_LENGTH = 20_000; // hex chars (~10KB)

export const createEntry = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      name: z.string().min(1).max(255),
      type: z.string().min(1).max(32),
      searchTerms: z.string().max(255).default(""),
      publicKey: z.string().length(66),
      encryptedData: z.string().max(MAX_ENCRYPTED_DATA_LENGTH),
      sourceMessageId: z.string().optional(),
      sourceAddress: z.string().optional(),
    }),
  )
  .handler(async ({ data, context: { userId } }) => {
    const { id, secretId } = await createVaultEntry(
      userId,
      data.name,
      data.type,
      data.searchTerms,
      data.publicKey,
      data.encryptedData,
      data.sourceMessageId,
      data.sourceAddress,
    );
    return { id, secretId };
  });

export const getMyEntries = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(
    z
      .object({
        query: z.string().optional(),
        beforeUpdatedAt: z.coerce.date().optional(),
        beforeId: z.string().optional(),
      })
      .optional(),
  )
  .handler(async ({ data, context: { userId } }) => {
    return getVaultEntries(
      userId,
      data?.query,
      data?.beforeUpdatedAt,
      data?.beforeId,
    );
  });

export const getEntry = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: versionId, context: { userId } }) => {
    return getVaultEntry(userId, versionId);
  });

export const updateEntry = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      secretId: z.string(),
      name: z.string().min(1).max(255),
      type: z.string().min(1).max(32),
      searchTerms: z.string().max(255).default(""),
      publicKey: z.string().length(66),
      encryptedData: z.string().max(MAX_ENCRYPTED_DATA_LENGTH),
    }),
  )
  .handler(async ({ data, context: { userId } }) => {
    const id = await createNewVersion(
      userId,
      data.secretId,
      data.name,
      data.type,
      data.searchTerms,
      data.publicKey,
      data.encryptedData,
    );
    return { id };
  });

export const deleteEntry = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: versionId, context: { userId } }) => {
    await deleteVersion(userId, versionId);
    return { success: true };
  });

export const deleteSecretFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: secretId, context: { userId } }) => {
    await deleteSecret(userId, secretId);
    return { success: true };
  });

export const getHistory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: secretId, context: { userId } }) => {
    return getSecretHistory(userId, secretId);
  });
