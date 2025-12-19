import { describe, it, expect, beforeEach } from "vitest";
import { generateId } from "@keypears/lib";
import {
  createInboxMessage,
  getInboxMessageById,
  getMessagesByChannel,
  markMessageAsRead,
  markAllMessagesAsRead,
  getUnreadCount,
  getUnreadCountByOwner,
} from "../src/db/models/inbox-message.js";
import { createChannelView } from "../src/db/models/channel.js";
import { db } from "../src/db/index.js";
import {
  TableInboxMessage,
  TableChannelView,
  TablePowChallenge,
} from "../src/db/schema.js";

describe("Inbox Message Model", () => {
  let testChannelId: string;
  let testPowChallengeId: string;

  beforeEach(async () => {
    // Clean up tables in correct order (messages first due to FK)
    await db.delete(TableInboxMessage);
    await db.delete(TableChannelView);
    await db.delete(TablePowChallenge);

    // Create a test channel
    const channel = await createChannelView({
      ownerAddress: "alice@example.com",
      counterpartyAddress: "bob@example2.com",
    });
    testChannelId = channel.id;

    // Create a test PoW challenge
    testPowChallengeId = generateId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

    await db.insert(TablePowChallenge).values({
      id: testPowChallengeId,
      algorithm: "pow5-64b",
      header: "0".repeat(128),
      target: "f".repeat(64),
      difficulty: "1",
      createdAt: now,
      expiresAt,
    });
  });

  describe("createInboxMessage", () => {
    it("should create message with auto-incremented orderInChannel", async () => {
      const message = await createInboxMessage({
        channelViewId: testChannelId,
        senderAddress: "bob@example2.com",
        encryptedContent: "encrypted-content-1",
        senderEngagementPubKey: `02${"a".repeat(64)}`,
        recipientEngagementPubKey: `02${"b".repeat(64)}`,
        powChallengeId: testPowChallengeId,
      });

      expect(message.orderInChannel).toBe(1);
      expect(message.channelViewId).toBe(testChannelId);
      expect(message.senderAddress).toBe("bob@example2.com");
      expect(message.isRead).toBe(false);
    });

    it("should set orderInChannel to 1 for first message", async () => {
      const message = await createInboxMessage({
        channelViewId: testChannelId,
        senderAddress: "bob@example2.com",
        encryptedContent: "first-message",
        senderEngagementPubKey: `02${"a".repeat(64)}`,
        recipientEngagementPubKey: `02${"b".repeat(64)}`,
        powChallengeId: testPowChallengeId,
      });

      expect(message.orderInChannel).toBe(1);
    });

    it("should increment orderInChannel for subsequent messages", async () => {
      // Create second PoW challenge for second message
      const powChallengeId2 = generateId();
      const now = new Date();
      await db.insert(TablePowChallenge).values({
        id: powChallengeId2,
        algorithm: "pow5-64b",
        header: "1".repeat(128),
        target: "f".repeat(64),
        difficulty: "1",
        createdAt: now,
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      });

      // Create third PoW challenge for third message
      const powChallengeId3 = generateId();
      await db.insert(TablePowChallenge).values({
        id: powChallengeId3,
        algorithm: "pow5-64b",
        header: "2".repeat(128),
        target: "f".repeat(64),
        difficulty: "1",
        createdAt: now,
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      });

      const msg1 = await createInboxMessage({
        channelViewId: testChannelId,
        senderAddress: "bob@example2.com",
        encryptedContent: "message-1",
        senderEngagementPubKey: `02${"a".repeat(64)}`,
        recipientEngagementPubKey: `02${"b".repeat(64)}`,
        powChallengeId: testPowChallengeId,
      });

      const msg2 = await createInboxMessage({
        channelViewId: testChannelId,
        senderAddress: "bob@example2.com",
        encryptedContent: "message-2",
        senderEngagementPubKey: `02${"c".repeat(64)}`,
        recipientEngagementPubKey: `02${"d".repeat(64)}`,
        powChallengeId: powChallengeId2,
      });

      const msg3 = await createInboxMessage({
        channelViewId: testChannelId,
        senderAddress: "bob@example2.com",
        encryptedContent: "message-3",
        senderEngagementPubKey: `02${"e".repeat(64)}`,
        recipientEngagementPubKey: `02${"f".repeat(64)}`,
        powChallengeId: powChallengeId3,
      });

      expect(msg1.orderInChannel).toBe(1);
      expect(msg2.orderInChannel).toBe(2);
      expect(msg3.orderInChannel).toBe(3);
    });
  });

  describe("getInboxMessageById", () => {
    it("should return message by ID", async () => {
      const created = await createInboxMessage({
        channelViewId: testChannelId,
        senderAddress: "bob@example2.com",
        encryptedContent: "test-content",
        senderEngagementPubKey: `02${"a".repeat(64)}`,
        recipientEngagementPubKey: `02${"b".repeat(64)}`,
        powChallengeId: testPowChallengeId,
      });

      const found = await getInboxMessageById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.encryptedContent).toBe("test-content");
    });

    it("should return null for non-existent ID", async () => {
      const found = await getInboxMessageById("00000000000000000000000000");

      expect(found).toBeNull();
    });
  });

  describe("getMessagesByChannel", () => {
    it("should return messages in reverse chronological order (DESC)", async () => {
      // Create additional PoW challenges
      const powId2 = generateId();
      const powId3 = generateId();
      const now = new Date();

      await db.insert(TablePowChallenge).values([
        {
          id: powId2,
          algorithm: "pow5-64b",
          header: "1".repeat(128),
          target: "f".repeat(64),
          difficulty: "1",
          createdAt: now,
          expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        },
        {
          id: powId3,
          algorithm: "pow5-64b",
          header: "2".repeat(128),
          target: "f".repeat(64),
          difficulty: "1",
          createdAt: now,
          expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        },
      ]);

      await createInboxMessage({
        channelViewId: testChannelId,
        senderAddress: "bob@example2.com",
        encryptedContent: "first",
        senderEngagementPubKey: `02${"a".repeat(64)}`,
        recipientEngagementPubKey: `02${"b".repeat(64)}`,
        powChallengeId: testPowChallengeId,
      });

      await createInboxMessage({
        channelViewId: testChannelId,
        senderAddress: "bob@example2.com",
        encryptedContent: "second",
        senderEngagementPubKey: `02${"c".repeat(64)}`,
        recipientEngagementPubKey: `02${"d".repeat(64)}`,
        powChallengeId: powId2,
      });

      await createInboxMessage({
        channelViewId: testChannelId,
        senderAddress: "bob@example2.com",
        encryptedContent: "third",
        senderEngagementPubKey: `02${"e".repeat(64)}`,
        recipientEngagementPubKey: `02${"f".repeat(64)}`,
        powChallengeId: powId3,
      });

      const result = await getMessagesByChannel(testChannelId);

      expect(result.messages).toHaveLength(3);
      // Reverse chronological: most recent (third) first
      expect(result.messages[0]!.encryptedContent).toBe("third");
      expect(result.messages[1]!.encryptedContent).toBe("second");
      expect(result.messages[2]!.encryptedContent).toBe("first");
    });

    it("should support pagination", async () => {
      // Create additional PoW challenges
      const powIds = [generateId(), generateId()];
      const now = new Date();

      await db.insert(TablePowChallenge).values(
        powIds.map((id, i) => ({
          id,
          algorithm: "pow5-64b",
          header: String(i + 1).repeat(128),
          target: "f".repeat(64),
          difficulty: "1",
          createdAt: now,
          expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        })),
      );

      await createInboxMessage({
        channelViewId: testChannelId,
        senderAddress: "bob@example2.com",
        encryptedContent: "message-1",
        senderEngagementPubKey: `02${"a".repeat(64)}`,
        recipientEngagementPubKey: `02${"b".repeat(64)}`,
        powChallengeId: testPowChallengeId,
      });

      await createInboxMessage({
        channelViewId: testChannelId,
        senderAddress: "bob@example2.com",
        encryptedContent: "message-2",
        senderEngagementPubKey: `02${"c".repeat(64)}`,
        recipientEngagementPubKey: `02${"d".repeat(64)}`,
        powChallengeId: powIds[0]!,
      });

      await createInboxMessage({
        channelViewId: testChannelId,
        senderAddress: "bob@example2.com",
        encryptedContent: "message-3",
        senderEngagementPubKey: `02${"e".repeat(64)}`,
        recipientEngagementPubKey: `02${"f".repeat(64)}`,
        powChallengeId: powIds[1]!,
      });

      // Get first 2 (most recent first, so orders 3 and 2)
      const page1 = await getMessagesByChannel(testChannelId, { limit: 2 });
      expect(page1.messages).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      // Verify reverse chronological order
      expect(page1.messages[0]!.orderInChannel).toBe(3);
      expect(page1.messages[1]!.orderInChannel).toBe(2);

      // Get older messages (before order 2, i.e. order < 2)
      const page2 = await getMessagesByChannel(testChannelId, {
        limit: 2,
        beforeOrder: 2,
      });
      expect(page2.messages).toHaveLength(1);
      expect(page2.hasMore).toBe(false);
      expect(page2.messages[0]!.orderInChannel).toBe(1);
    });

    it("should return empty array for channel with no messages", async () => {
      const newChannel = await createChannelView({
        ownerAddress: "charlie@example.com",
        counterpartyAddress: "dave@example.com",
      });

      const result = await getMessagesByChannel(newChannel.id);

      expect(result.messages).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe("markMessageAsRead", () => {
    it("should set isRead to true", async () => {
      const message = await createInboxMessage({
        channelViewId: testChannelId,
        senderAddress: "bob@example2.com",
        encryptedContent: "unread-message",
        senderEngagementPubKey: `02${"a".repeat(64)}`,
        recipientEngagementPubKey: `02${"b".repeat(64)}`,
        powChallengeId: testPowChallengeId,
      });

      expect(message.isRead).toBe(false);

      await markMessageAsRead(message.id);

      const updated = await getInboxMessageById(message.id);
      expect(updated?.isRead).toBe(true);
    });
  });

  describe("markAllMessagesAsRead", () => {
    it("should mark all messages in channel as read", async () => {
      // Create additional PoW challenges
      const powId2 = generateId();
      const now = new Date();

      await db.insert(TablePowChallenge).values({
        id: powId2,
        algorithm: "pow5-64b",
        header: "1".repeat(128),
        target: "f".repeat(64),
        difficulty: "1",
        createdAt: now,
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      });

      const msg1 = await createInboxMessage({
        channelViewId: testChannelId,
        senderAddress: "bob@example2.com",
        encryptedContent: "message-1",
        senderEngagementPubKey: `02${"a".repeat(64)}`,
        recipientEngagementPubKey: `02${"b".repeat(64)}`,
        powChallengeId: testPowChallengeId,
      });

      const msg2 = await createInboxMessage({
        channelViewId: testChannelId,
        senderAddress: "bob@example2.com",
        encryptedContent: "message-2",
        senderEngagementPubKey: `02${"c".repeat(64)}`,
        recipientEngagementPubKey: `02${"d".repeat(64)}`,
        powChallengeId: powId2,
      });

      // Both should be unread
      expect(msg1.isRead).toBe(false);
      expect(msg2.isRead).toBe(false);

      await markAllMessagesAsRead(testChannelId);

      const updated1 = await getInboxMessageById(msg1.id);
      const updated2 = await getInboxMessageById(msg2.id);

      expect(updated1?.isRead).toBe(true);
      expect(updated2?.isRead).toBe(true);
    });
  });

  describe("getUnreadCount", () => {
    it("should return count of unread messages", async () => {
      // Create additional PoW challenges
      const powId2 = generateId();
      const now = new Date();

      await db.insert(TablePowChallenge).values({
        id: powId2,
        algorithm: "pow5-64b",
        header: "1".repeat(128),
        target: "f".repeat(64),
        difficulty: "1",
        createdAt: now,
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      });

      const msg1 = await createInboxMessage({
        channelViewId: testChannelId,
        senderAddress: "bob@example2.com",
        encryptedContent: "message-1",
        senderEngagementPubKey: `02${"a".repeat(64)}`,
        recipientEngagementPubKey: `02${"b".repeat(64)}`,
        powChallengeId: testPowChallengeId,
      });

      await createInboxMessage({
        channelViewId: testChannelId,
        senderAddress: "bob@example2.com",
        encryptedContent: "message-2",
        senderEngagementPubKey: `02${"c".repeat(64)}`,
        recipientEngagementPubKey: `02${"d".repeat(64)}`,
        powChallengeId: powId2,
      });

      let unreadCount = await getUnreadCount(testChannelId);
      expect(unreadCount).toBe(2);

      // Mark one as read
      await markMessageAsRead(msg1.id);

      unreadCount = await getUnreadCount(testChannelId);
      expect(unreadCount).toBe(1);
    });

    it("should return 0 when all messages read", async () => {
      await createInboxMessage({
        channelViewId: testChannelId,
        senderAddress: "bob@example2.com",
        encryptedContent: "message",
        senderEngagementPubKey: `02${"a".repeat(64)}`,
        recipientEngagementPubKey: `02${"b".repeat(64)}`,
        powChallengeId: testPowChallengeId,
      });

      await markAllMessagesAsRead(testChannelId);

      const unreadCount = await getUnreadCount(testChannelId);
      expect(unreadCount).toBe(0);
    });

    it("should return 0 for channel with no messages", async () => {
      const newChannel = await createChannelView({
        ownerAddress: "charlie@example.com",
        counterpartyAddress: "dave@example.com",
      });

      const unreadCount = await getUnreadCount(newChannel.id);
      expect(unreadCount).toBe(0);
    });
  });

  describe("getUnreadCountByOwner", () => {
    it("should sum unread across all channels for owner", async () => {
      // Create second channel for same owner
      const channel2 = await createChannelView({
        ownerAddress: "alice@example.com",
        counterpartyAddress: "charlie@example3.com",
      });

      // Create additional PoW challenges
      const powId2 = generateId();
      const now = new Date();

      await db.insert(TablePowChallenge).values({
        id: powId2,
        algorithm: "pow5-64b",
        header: "1".repeat(128),
        target: "f".repeat(64),
        difficulty: "1",
        createdAt: now,
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      });

      // Message in first channel
      await createInboxMessage({
        channelViewId: testChannelId,
        senderAddress: "bob@example2.com",
        encryptedContent: "message-in-channel-1",
        senderEngagementPubKey: `02${"a".repeat(64)}`,
        recipientEngagementPubKey: `02${"b".repeat(64)}`,
        powChallengeId: testPowChallengeId,
      });

      // Message in second channel
      await createInboxMessage({
        channelViewId: channel2.id,
        senderAddress: "charlie@example3.com",
        encryptedContent: "message-in-channel-2",
        senderEngagementPubKey: `02${"c".repeat(64)}`,
        recipientEngagementPubKey: `02${"d".repeat(64)}`,
        powChallengeId: powId2,
      });

      const totalUnread = await getUnreadCountByOwner("alice@example.com");
      expect(totalUnread).toBe(2);
    });

    it("should return 0 for owner with no unread messages", async () => {
      await createInboxMessage({
        channelViewId: testChannelId,
        senderAddress: "bob@example2.com",
        encryptedContent: "message",
        senderEngagementPubKey: `02${"a".repeat(64)}`,
        recipientEngagementPubKey: `02${"b".repeat(64)}`,
        powChallengeId: testPowChallengeId,
      });

      await markAllMessagesAsRead(testChannelId);

      const totalUnread = await getUnreadCountByOwner("alice@example.com");
      expect(totalUnread).toBe(0);
    });

    it("should return 0 for owner with no channels", async () => {
      const totalUnread = await getUnreadCountByOwner("nobody@example.com");
      expect(totalUnread).toBe(0);
    });
  });
});
