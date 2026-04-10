+++
status = "open"
opened = "2026-04-10"
+++

# Issue 13: Boost Posts with Proof of Work

## Goal

Allow users to boost any post by spending proof-of-work on it. Boosts are public
endorsements with real computational cost — you can't mass-boost without real
GPU time. Users can boost the same post multiple times, each with any amount of
PoW above the minimum.

## Background

The public feed has no engagement mechanism. Posts appear in chronological order
and disappear. Boosts add a social signal: "I spent computation to say this post
matters." Unlike likes (which are free and meaningless), boosts have real cost,
making them a genuine signal of value.

### How it works

- Any user can boost any post by clicking "Boost" and mining PoW.
- Minimum boost difficulty: 7M (same as message PoW).
- You can boost the same post multiple times — each boost adds more PoW.
- Each post displays its total boost PoW (sum of all boosts).
- Click the boost count to see who boosted and how much.
- Boost PoW is logged against the booster's profile total (they did the work),
  but boosts don't appear as posts on the booster's profile.

### What needs to change

**Database:**

- New `boosts` table: id, postId (indexed), userId, senderAddress, difficulty
  (bigint), createdAt.
- No unique constraint on (postId, userId) — multiple boosts per user per post
  are allowed.

**Server:**

- `post.server.ts` — add `insertBoost`, `getBoostsForPost`,
  `getTotalBoostForPost`.
- `post.functions.ts` — add server functions:
  - `boostPost({ postId, pow })` — requires session, verifies PoW, inserts
    boost, logs PoW.
  - `getPostBoosts({ postId })` — returns list of boosters with their total
    contribution per user.

**UI:**

- Each `PostCard` shows a "Boost" button with the total boost amount (using
  PowBadge).
- Clicking "Boost" triggers PowModal at minimum difficulty (7M).
- Clicking the boost count expands a list of boosters (address + their total
  boost amount).

**Feed query:**

- `getFeedPosts` and `getUserPosts` should include the total boost for each
  post. This could be a subquery or a separate query after fetching posts.

### What stays the same

- Post creation flow (unchanged).
- Dynamic difficulty throttling (for posts, not boosts).
- Profile page shows authored posts only (not boosts).
- Total PoW counter on profile includes boost PoW.

## Experiments

### Experiment 1: Boost posts with PoW

#### Description

Add a `boosts` table, server functions for boosting, and UI on the
PostCard to boost and view boosters.

#### Changes

**`webapp/src/db/schema.ts`:**

- Add `totalBoost` bigint column to `posts` table (default 0). Pre-
  computed aggregate — incremented on each boost. Feed queries read
  this directly, no joins needed.

- New `boosts` table (individual boost records):
  - `id` binaryId PK
  - `postId` binaryId NOT NULL (index)
  - `userId` binaryId NOT NULL
  - `senderAddress` varchar(255) NOT NULL
  - `difficulty` bigint NOT NULL
  - `createdAt` timestamp DEFAULT NOW() NOT NULL

**`webapp/src/server/post.server.ts`:**

- `insertBoost(postId, userId, senderAddress, difficulty)` — inserts
  a boost record AND atomically increments `posts.totalBoost`:
  `UPDATE posts SET totalBoost = totalBoost + difficulty WHERE id = ?`
- `getBoostersForPost(postId)` — returns boosters grouped by user
  with their total contribution, ordered by total desc.
- `getFeedPosts` and `getUserPosts` — already return all post columns,
  so `totalBoost` is included automatically. No query changes needed.

**`webapp/src/server/post.functions.ts`:**

- `boostPost({ postId, pow })` — requires session. Verifies PoW (at
  minimum MESSAGE_DIFFICULTY). Inserts boost. Logs PoW.
- `getPostBoosters({ postId })` — returns booster list.

**`webapp/src/components/PostCard.tsx`:**

- Add "Boost" button with a rocket/zap icon. Shows total boost amount
  via PowBadge (or "0" if no boosts).
- Clicking "Boost" triggers PowModal at MESSAGE_DIFFICULTY (7M).
- After boosting, refresh the boost total on that card.
- Clicking the boost total expands a collapsible list of boosters
  (address linked to profile + their total boost, each with PowBadge).

**`webapp/src/routes/_app/_saved/_chrome/feed.tsx`:**

- Pass boost totals through to PostCard.
- After a boost completes, refresh the feed (or just the boosted
  post's total).

**`webapp/src/routes/_app/_saved/_chrome/$profile.tsx`:**

- Same — pass boost totals through to PostCard.

#### Verification

1. Post a message. Boost total shows 0 or is hidden.
2. Click "Boost" — PowModal appears at 7M, mines, boost is recorded.
3. Boost total updates on the post (shows 7M via PowBadge).
4. Boost the same post again — total increases (14M).
5. Another user boosts the same post — total includes both.
6. Click the boost total — expands to show boosters with their
   individual totals.
7. Booster's profile total PoW includes their boost work.
8. Boosts do NOT appear as posts on the booster's profile.
9. Feed and profile pages both show boost totals on posts.
