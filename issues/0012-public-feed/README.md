+++
status = "open"
opened = "2026-04-10"
+++

# Issue 12: Public Feed

## Goal

Add a public chronological feed to KeyPears — a town square where users can post
short public messages. The feed serves as a discovery layer: you see what people
are saying, find someone interesting, and message them privately. The feed
complements the encrypted messaging system by solving the "who do I message?"
problem.

## Background

KeyPears currently has no way to discover other users. You need to know
someone's address to message them. A public feed creates natural connections —
users post publicly, others see the posts, and private conversations start from
there.

### Design principles

**Simple chronological feed.** No algorithm, no recommendations, no "for you"
tab. Everyone on the server sees the same posts in time order. Privacy-first
means no engagement tracking or behavioral profiling.

**Public by design.** Posts are NOT encrypted — this is intentional. The feed is
for discovery, not privacy. If you want privacy, use the encrypted messaging
system.

**PoW-gated.** Each post requires proof-of-work, same as messages. This prevents
spam without moderation. The server can set a default post difficulty, and this
could be configurable per-user in the future.

**Minimal features.** No replies, no likes, no retweets, no threads. Just posts.
If you want to respond to someone, message them. This keeps the feed simple and
pushes real conversation into the encrypted channel.

### What it looks like

- A `/feed` route accessible to logged-in users.
- Compose box at the top with a character limit.
- Scrolling list of posts in reverse chronological order.
- Each post shows: author address (clickable to profile), post content,
  timestamp, and PoW badge.
- "Load more" button for pagination.

### What needs to change

**Database:**

- New `posts` table: id, userId, content (plaintext), senderAddress, difficulty
  (bigint), createdAt.
- Index on createdAt for efficient reverse-chronological queries.
- Index on userId for per-user post lookups.

**Server:**

- `post.server.ts` — DB logic for creating and querying posts.
- `post.functions.ts` — server functions for the client:
  - `createPost(content, pow)` — requires PoW, creates post.
  - `getFeed(beforeId?)` — paginated feed, reverse chronological.
  - `getUserPosts(address, beforeId?)` — posts by a specific user.

**API (federation, future):**

- New oRPC endpoint `getFeed` — allows other servers to pull a server's public
  feed. Not required for v1 but the data model should support it.

**UI:**

- `/feed` route with compose box and post list.
- Sidebar: add "Feed" link.
- Profile page: optionally show the user's recent posts.

**PoW:**

- Posts require PoW at a configurable difficulty (default MESSAGE_DIFFICULTY).
- Could add `postDifficulty` to user settings in the future.

### Character limit

Posts are plaintext, so we enforce a character limit directly: 240
characters (tweet-length). URLs are auto-linked in the UI — no markdown.

### What stays the same

- Encrypted messaging system (unchanged).
- Federation protocol (posts are local to the server for v1).
- Authentication and session management.
- PoW infrastructure (reused for posts).

## Experiments

### Experiment 1: Basic feed with PoW-gated posts

#### Description

Add a `posts` table, server functions for creating and querying posts,
a `/feed` route with compose box and post list, and a "Feed" link in
the sidebar. Posts require PoW (same as messages). URLs in posts are
auto-linked.

#### Changes

**`webapp/src/db/schema.ts`:**

- New `posts` table:
  - `id` binaryId PK
  - `userId` binaryId NOT NULL (index)
  - `senderAddress` varchar(255) NOT NULL
  - `content` varchar(240) NOT NULL
  - `difficulty` bigint NOT NULL
  - `createdAt` timestamp DEFAULT NOW() NOT NULL (index, for pagination)

**`webapp/src/server/post.server.ts`:**

- `insertPost(userId, senderAddress, content, difficulty)` — inserts a
  post.
- `getFeedPosts(limit, beforeId?)` — reverse chronological, cursor
  paginated by id.
- `getUserPosts(userId, limit, beforeId?)` — posts by a specific user.

**`webapp/src/server/post.functions.ts`:**

- `createPost({ content, pow })` — requires session. Validates content
  (1-240 chars via Zod). Verifies and consumes PoW. Extracts difficulty
  from target. Inserts post. Logs PoW.
- `getFeed({ beforeId? })` — paginated feed, 20 posts per page.
- `getUserPostsByAddress({ address, beforeId? })` — posts by address.

**`webapp/src/routes/index.tsx`:**

- Change redirect from `/inbox` to `/feed` for logged-in users. The
  feed is the home page.

**`webapp/src/routes/_app/_saved/_chrome/feed.tsx`:**

- Compose box at top: textarea with character counter (X/240), disabled
  Send button when empty or over limit.
- Clicking Send triggers PoW (using PowModal), then creates the post.
- Post list below: each post shows senderAddress (linked to profile),
  content (with auto-linked URLs), timestamp, and PowBadge showing
  the PoW difficulty for that specific post.
- "Load more" button at bottom.

**`webapp/src/components/PostCard.tsx`:**

- Reusable post card component used on both the feed and profile pages.
- Shows: author address (clickable link to profile), content (with
  auto-linked URLs), timestamp, PowBadge for that post's difficulty.

**`webapp/src/components/PostContent.tsx`:**

- Renders post text with auto-linked URLs. Uses regex to detect URLs
  and wraps them in `<a>` tags. All other text is plain.

**`webapp/src/components/Sidebar.tsx`:**

- Add "Feed" link with an icon in the nav items (at the top, before
  Inbox).

**`webapp/src/routes/_app/_saved/_chrome/$profile.tsx`:**

- Remove PoW history list (keep total PoW counter).
- Replace with the user's public posts, using PostCard. Paginated
  with "Load more".

#### Verification

1. Log in — redirected to `/feed` (not `/inbox`).
2. Compose box is visible at top of feed.
3. Type a post over 240 chars — character counter turns red, Send
   disabled.
4. Type a valid post, click Send — PowModal appears, mines, post
   appears in feed with PowBadge showing difficulty.
5. Post with a URL — URL is clickable in the feed.
6. Scroll down, click "Load more" — older posts appear.
7. Click an author's address — navigates to their profile.
8. Profile page shows the user's posts (not PoW history), each with
   PowBadge. Total PoW counter still shown.
9. Feed is reverse chronological — newest first.

### Experiment 2: Dynamic difficulty throttling

#### Description

Dynamically raise the PoW difficulty for posts when the feed is busy.
This caps the volume of posts to a readable pace (~1 per minute) without
any moderation or rate limiting infrastructure.

**Algorithm:**

Look at the timestamp of the 10th most recent post (one indexed query
with `OFFSET 9`). If that post is within the last 10 minutes, the feed
is "hot" and difficulty increases exponentially:

```
tenthPostTime = SELECT createdAt FROM posts ORDER BY id DESC LIMIT 1 OFFSET 9
elapsed = NOW() - tenthPostTime (in seconds)

if no result or elapsed >= 600:
  difficulty = BASE_DIFFICULTY (70M)
else:
  difficulty = BASE_DIFFICULTY * 2^((600 - elapsed) / 60)
```

Examples at BASE = 70M:
- 10th post was 9 min ago → 2^1 = 2x → 140M
- 10th post was 5 min ago → 2^5 = 32x → 2.24B (~minutes to mine)
- 10th post was 1 min ago → 2^9 = 512x → 35.8B (~hours to mine)

Self-correcting: as difficulty rises, posting slows, the 10th post ages
out, difficulty drops back. Per-server, not per-user — a single spammer
raises difficulty for everyone, which is the correct incentive.

**Performance:** One `SELECT ... ORDER BY id DESC LIMIT 1 OFFSET 9` on
an indexed column. Fast, bounded, no counting.

#### Changes

**`webapp/src/server/post.server.ts`:**

- Add `getPostDifficulty()` — runs the query, computes the dynamic
  difficulty, returns the bigint.

**`webapp/src/server/post.functions.ts`:**

- Add `getPostPowChallenge()` — server function that computes dynamic
  difficulty and returns a PoW challenge at that difficulty.
- `createPost` — verify PoW against the dynamic difficulty (the
  challenge was already issued at the right difficulty, so the existing
  verification works).

**`webapp/src/routes/_app/_saved/_chrome/feed.tsx`:**

- Use `getPostPowChallenge` instead of `getPowChallenge` when posting.
- Show the current difficulty in the compose area so the user knows
  the cost before posting.

#### Verification

1. Empty feed — post difficulty is 70M (base).
2. Post 10 times quickly — difficulty starts rising.
3. After 10 posts in under 10 minutes, next challenge shows higher
   difficulty (visible in PowModal).
4. Wait 10 minutes — difficulty drops back to 70M.
5. The 10th post query is fast (EXPLAIN shows index usage).

### Experiment 3: No newlines, input box with preview

#### Description

Replace the textarea with a single-line input box. Newlines are
prohibited — Zod validation rejects them server-side, and the client
trims + replaces any newlines with spaces. Add a live preview below the
input showing how the post will render, including auto-linked URLs.

#### Changes

**`webapp/src/server/post.functions.ts`:**

- `createPost` Zod validator: add `.regex(/^\S.*\S$|^\S$/, ...)` or
  simply `.refine(s => !s.includes('\n'))` to reject newlines. Also
  `.transform(s => s.trim().replace(/\s+/g, ' '))` to normalize
  whitespace.

**`webapp/src/routes/_app/_saved/_chrome/feed.tsx`:**

- Replace `<textarea>` with `<input type="text">`.
- Client-side: on change, trim and replace newlines/multiple spaces
  with single space.
- Add preview below the input using `PostContent` component — shows
  auto-linked URLs as they'll appear.
- Character counter stays.

#### Verification

1. Input box is single-line (not textarea).
2. Pasting text with newlines — newlines replaced with spaces.
3. Preview below input shows auto-linked URLs in real-time.
4. Server rejects posts with newlines via Zod.
5. 240 char limit still enforced.
