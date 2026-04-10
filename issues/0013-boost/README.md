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
