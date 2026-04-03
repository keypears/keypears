import { describe, it, expect, beforeEach } from "vitest";
import {
  createChannelView,
  getChannelViewById,
  getChannelView,
  getOrCreateChannelView,
  getChannelsByOwner,
  updateChannelMinDifficulty,
} from "../src/db/models/channel.js";
import { db } from "../src/db/index.js";
import { TableChannelView } from "../src/db/schema.js";

describe("Channel Model", () => {
  beforeEach(async () => {
    // Clean up table before each test
    await db.delete(TableChannelView);
  });

  describe("createChannelView", () => {
    it("should create a new channel view", async () => {
      const channel = await createChannelView({
        ownerAddress: "alice@example.com",
        counterpartyAddress: "bob@example2.com",
      });

      expect(channel.ownerAddress).toBe("alice@example.com");
      expect(channel.counterpartyAddress).toBe("bob@example2.com");
      expect(channel.id).toHaveLength(26);
      expect(channel.createdAt).toBeInstanceOf(Date);
      expect(channel.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe("getChannelViewById", () => {
    it("should return channel by ID", async () => {
      const created = await createChannelView({
        ownerAddress: "alice@example.com",
        counterpartyAddress: "bob@example2.com",
      });

      const found = await getChannelViewById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.ownerAddress).toBe("alice@example.com");
    });

    it("should return null for non-existent ID", async () => {
      const found = await getChannelViewById("00000000000000000000000000");

      expect(found).toBeNull();
    });
  });

  describe("getChannelView", () => {
    it("should return channel by owner and counterparty", async () => {
      const created = await createChannelView({
        ownerAddress: "alice@example.com",
        counterpartyAddress: "bob@example2.com",
      });

      const found = await getChannelView(
        "alice@example.com",
        "bob@example2.com",
      );

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
    });

    it("should return null for non-existent channel", async () => {
      const found = await getChannelView(
        "nonexistent@example.com",
        "nobody@example.com",
      );

      expect(found).toBeNull();
    });

    it("should be direction-specific (owner vs counterparty)", async () => {
      await createChannelView({
        ownerAddress: "alice@example.com",
        counterpartyAddress: "bob@example2.com",
      });

      // Looking up with swapped addresses should not find it
      const found = await getChannelView(
        "bob@example2.com",
        "alice@example.com",
      );

      expect(found).toBeNull();
    });
  });

  describe("getOrCreateChannelView", () => {
    it("should create channel if not exists", async () => {
      const result = await getOrCreateChannelView(
        "alice@example.com",
        "bob@example2.com",
      );

      expect(result.isNew).toBe(true);
      expect(result.channel.ownerAddress).toBe("alice@example.com");
      expect(result.channel.counterpartyAddress).toBe("bob@example2.com");
    });

    it("should return existing channel if exists", async () => {
      // Create channel first
      const created = await createChannelView({
        ownerAddress: "alice@example.com",
        counterpartyAddress: "bob@example2.com",
      });

      // Get or create should return existing
      const result = await getOrCreateChannelView(
        "alice@example.com",
        "bob@example2.com",
      );

      expect(result.isNew).toBe(false);
      expect(result.channel.id).toBe(created.id);
    });

    it("should return isNew: true for new channels", async () => {
      const result = await getOrCreateChannelView(
        "new@example.com",
        "user@example.com",
      );

      expect(result.isNew).toBe(true);
    });

    it("should return isNew: false for existing channels", async () => {
      // Create first
      await createChannelView({
        ownerAddress: "alice@example.com",
        counterpartyAddress: "bob@example2.com",
      });

      // Get or create
      const result = await getOrCreateChannelView(
        "alice@example.com",
        "bob@example2.com",
      );

      expect(result.isNew).toBe(false);
    });
  });

  describe("getChannelsByOwner", () => {
    it("should return channels sorted by updatedAt DESC", async () => {
      // Create channels with different timestamps
      const channel1 = await createChannelView({
        ownerAddress: "alice@example.com",
        counterpartyAddress: "bob@example2.com",
      });

      // Wait to ensure different timestamps
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 50);
      });

      const channel2 = await createChannelView({
        ownerAddress: "alice@example.com",
        counterpartyAddress: "charlie@example3.com",
      });

      const result = await getChannelsByOwner("alice@example.com");

      expect(result.channels).toHaveLength(2);
      // Most recent first
      expect(result.channels[0]!.id).toBe(channel2.id);
      expect(result.channels[1]!.id).toBe(channel1.id);
    });

    it("should support pagination with beforeUpdatedAt", async () => {
      // Create 3 channels
      await createChannelView({
        ownerAddress: "alice@example.com",
        counterpartyAddress: "bob@example2.com",
      });

      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 50);
      });

      const channel2 = await createChannelView({
        ownerAddress: "alice@example.com",
        counterpartyAddress: "charlie@example3.com",
      });

      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 50);
      });

      await createChannelView({
        ownerAddress: "alice@example.com",
        counterpartyAddress: "dave@example4.com",
      });

      // Get channels before channel2's updatedAt
      const result = await getChannelsByOwner("alice@example.com", {
        beforeUpdatedAt: channel2.updatedAt,
      });

      // Should only get the first channel
      expect(result.channels).toHaveLength(1);
      expect(result.channels[0]!.counterpartyAddress).toBe("bob@example2.com");
    });

    it("should return hasMore correctly", async () => {
      // Create 3 channels
      await createChannelView({
        ownerAddress: "alice@example.com",
        counterpartyAddress: "user1@example.com",
      });
      await createChannelView({
        ownerAddress: "alice@example.com",
        counterpartyAddress: "user2@example.com",
      });
      await createChannelView({
        ownerAddress: "alice@example.com",
        counterpartyAddress: "user3@example.com",
      });

      // Request with limit 2
      const result = await getChannelsByOwner("alice@example.com", {
        limit: 2,
      });

      expect(result.channels).toHaveLength(2);
      expect(result.hasMore).toBe(true);

      // Request all
      const allResult = await getChannelsByOwner("alice@example.com", {
        limit: 10,
      });
      expect(allResult.hasMore).toBe(false);
    });

    it("should return empty array for owner with no channels", async () => {
      const result = await getChannelsByOwner("nobody@example.com");

      expect(result.channels).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe("updateChannelMinDifficulty", () => {
    it("should update min difficulty", async () => {
      const channel = await createChannelView({
        ownerAddress: "alice@example.com",
        counterpartyAddress: "bob@example2.com",
      });

      const updated = await updateChannelMinDifficulty(
        channel.id,
        1000000000000,
      );

      expect(updated).not.toBeNull();
      expect(updated?.minDifficulty).toBe(1000000000000);
    });

    it("should allow setting to null", async () => {
      const channel = await createChannelView({
        ownerAddress: "alice@example.com",
        counterpartyAddress: "bob@example2.com",
      });

      // Set difficulty
      await updateChannelMinDifficulty(channel.id, 1000000000000);

      // Clear difficulty
      const updated = await updateChannelMinDifficulty(channel.id, null);

      expect(updated).not.toBeNull();
      expect(updated?.minDifficulty).toBeNull();
    });
  });

  describe("unique constraint", () => {
    it("should prevent duplicate owner+counterparty pairs", async () => {
      await createChannelView({
        ownerAddress: "alice@example.com",
        counterpartyAddress: "bob@example2.com",
      });

      // Attempting to create duplicate should fail
      await expect(
        createChannelView({
          ownerAddress: "alice@example.com",
          counterpartyAddress: "bob@example2.com",
        }),
      ).rejects.toThrow();
    });

    it("should allow same pair with different owner", async () => {
      // Alice's view of channel with Bob
      await createChannelView({
        ownerAddress: "alice@example.com",
        counterpartyAddress: "bob@example2.com",
      });

      // Bob's view of channel with Alice (different owner)
      const bobChannel = await createChannelView({
        ownerAddress: "bob@example2.com",
        counterpartyAddress: "alice@example.com",
      });

      expect(bobChannel).not.toBeNull();
      expect(bobChannel.ownerAddress).toBe("bob@example2.com");
    });
  });
});
