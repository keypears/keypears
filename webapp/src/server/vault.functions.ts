import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "./auth-middleware";
import {
  createVaultEntry,
  getVaultEntries,
  getVaultEntry,
  updateVaultEntry,
  deleteVaultEntry,
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
    }),
  )
  .handler(async ({ data, context: { userId } }) => {
    const id = await createVaultEntry(
      userId,
      data.name,
      data.type,
      data.searchTerms,
      data.publicKey,
      data.encryptedData,
    );
    return { id };
  });

export const getMyEntries = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(
    z
      .object({
        query: z.string().optional(),
        beforeId: z.string().optional(),
      })
      .optional(),
  )
  .handler(async ({ data, context: { userId } }) => {
    return getVaultEntries(userId, data?.query, data?.beforeId);
  });

export const getEntry = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: entryId, context: { userId } }) => {
    return getVaultEntry(userId, entryId);
  });

export const updateEntry = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      id: z.string(),
      name: z.string().min(1).max(255),
      type: z.string().min(1).max(32),
      searchTerms: z.string().max(255).default(""),
      publicKey: z.string().length(66),
      encryptedData: z.string().max(MAX_ENCRYPTED_DATA_LENGTH),
    }),
  )
  .handler(async ({ data, context: { userId } }) => {
    await updateVaultEntry(
      userId,
      data.id,
      data.name,
      data.type,
      data.searchTerms,
      data.publicKey,
      data.encryptedData,
    );
    return { success: true };
  });

export const deleteEntry = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: entryId, context: { userId } }) => {
    await deleteVaultEntry(userId, entryId);
    return { success: true };
  });
