import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSessionUserId } from "./session";
import {
  createVaultEntry,
  getVaultEntries,
  getVaultEntry,
  updateVaultEntry,
  deleteVaultEntry,
} from "./vault.server";

const MAX_ENCRYPTED_DATA_LENGTH = 20_000; // hex chars (~10KB)

export const createEntry = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1).max(255),
      type: z.string().min(1).max(32),
      searchTerms: z.string().max(255).default(""),
      publicKey: z.string().length(66),
      encryptedData: z.string().max(MAX_ENCRYPTED_DATA_LENGTH),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireSessionUserId();
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
  .inputValidator(
    z
      .object({
        query: z.string().optional(),
        beforeId: z.string().optional(),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const userId = await requireSessionUserId();
    return getVaultEntries(userId, data?.query, data?.beforeId);
  });

export const getEntry = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data: entryId }) => {
    const userId = await requireSessionUserId();
    return getVaultEntry(userId, entryId);
  });

export const updateEntry = createServerFn({ method: "POST" })
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
  .handler(async ({ data }) => {
    const userId = await requireSessionUserId();
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
  .inputValidator(z.string())
  .handler(async ({ data: entryId }) => {
    const userId = await requireSessionUserId();
    await deleteVaultEntry(userId, entryId);
    return { success: true };
  });
