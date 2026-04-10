+++
status = "open"
opened = "2026-04-10"
+++

# Issue 12: Public Feed

## Goal

Add a public chronological feed to KeyPears — a town square where users
can post short public messages. The feed serves as a discovery layer:
you see what people are saying, find someone interesting, and message
them privately. The feed complements the encrypted messaging system by
solving the "who do I message?" problem.

## Background

KeyPears currently has no way to discover other users. You need to know
someone's address to message them. A public feed creates natural
connections — users post publicly, others see the posts, and private
conversations start from there.

### Design principles

**Simple chronological feed.** No algorithm, no recommendations, no
"for you" tab. Everyone on the server sees the same posts in time order.
Privacy-first means no engagement tracking or behavioral profiling.

**Public by design.** Posts are NOT encrypted — this is intentional. The
feed is for discovery, not privacy. If you want privacy, use the
encrypted messaging system.

**PoW-gated.** Each post requires proof-of-work, same as messages. This
prevents spam without moderation. The server can set a default post
difficulty, and this could be configurable per-user in the future.

**Minimal features.** No replies, no likes, no retweets, no threads. Just
posts. If you want to respond to someone, message them. This keeps the
feed simple and pushes real conversation into the encrypted channel.

### What it looks like

- A `/feed` route accessible to logged-in users.
- Compose box at the top with a character limit.
- Scrolling list of posts in reverse chronological order.
- Each post shows: author address (clickable to profile), post content,
  timestamp, and PoW badge.
- "Load more" button for pagination.

### What needs to change

**Database:**

- New `posts` table: id, userId, content (plaintext), senderAddress,
  difficulty (bigint), createdAt.
- Index on createdAt for efficient reverse-chronological queries.
- Index on userId for per-user post lookups.

**Server:**

- `post.server.ts` — DB logic for creating and querying posts.
- `post.functions.ts` — server functions for the client:
  - `createPost(content, pow)` — requires PoW, creates post.
  - `getFeed(beforeId?)` — paginated feed, reverse chronological.
  - `getUserPosts(address, beforeId?)` — posts by a specific user.

**API (federation, future):**

- New oRPC endpoint `getFeed` — allows other servers to pull a server's
  public feed. Not required for v1 but the data model should support it.

**UI:**

- `/feed` route with compose box and post list.
- Sidebar: add "Feed" link.
- Profile page: optionally show the user's recent posts.

**PoW:**

- Posts require PoW at a configurable difficulty (default MESSAGE_DIFFICULTY).
- Could add `postDifficulty` to user settings in the future.

### Character limit

Posts are plaintext (not encrypted), so we can enforce a character limit
directly. 500 characters is reasonable — short enough to keep the feed
scannable, long enough for a meaningful thought.

### What stays the same

- Encrypted messaging system (unchanged).
- Federation protocol (posts are local to the server for v1).
- Authentication and session management.
- PoW infrastructure (reused for posts).
