+++
status = "closed"
opened = "2026-04-02"
closed = "2026-04-02"
+++

# Issue 1: Email Architecture Research

Research and determine the architecture for a full-featured, web-based email
client built into Rickbait. This will be a first-class feature — not a bolt-on
notification system, but a real email experience comparable to Hey.com. Email is
one part of a larger communication platform that Rickbait will become.

## Goal

Determine how to build email for Rickbait: what protocols to use for
sending/receiving, how to store messages, and whether to use existing services
or build from scratch. The outcome is an architectural decision with enough
detail to begin implementation.

## Background

Rickbait users are identified by their Rick Roll number (RRN). Each user has a
secp256k1 key pair. Email needs to integrate with this identity system — users
should be able to send and receive email as `{RRN}@rickbait.com` or similar.

The preference is toward building the email system ourselves for full control
over the experience, but an off-the-shelf solution may be viable if it provides
the necessary flexibility. The system must scale to a large number of users on
infrastructure we control (Google Cloud Run + PlanetScale/Vitess).

## Scope

The research should cover the following areas:

### 1. Sending and receiving email (SMTP/protocol layer)

- How does SMTP work for sending outbound email? What infrastructure is needed
  (MX records, SPF, DKIM, DMARC)?
- How does inbound email work? What listens for incoming mail?
- Can we run our own SMTP server, or is this operationally painful for a solo
  operator?
- Cloud email services: AWS SES, Google Workspace, others.
- Third-party email APIs: SendGrid, Mailgun, Postmark, Amazon SES — what do they
  offer for sending, receiving, and webhook-based inbound processing?
- Open-source SMTP servers: Postfix, Haraka (Node.js), Stalwart (Rust), others.
- Writing our own SMTP implementation in Rust or TypeScript — is this feasible,
  and what would it take?

### 2. Message storage

- Can email messages be stored in MySQL/Vitess/PlanetScale? What schema makes
  sense for a full email client (threads, labels, search, attachments)?
- Would a different database be better for email? ScyllaDB, PostgreSQL with
  full-text search, a dedicated search index (Meilisearch, Typesense)?
- How do existing email systems store messages (Dovecot/Maildir,
  database-backed, object storage for attachments)?
- Storage of attachments — database blobs, object storage (R2, S3), or a hybrid?

### 3. Email client experience

- What does a modern web-based email client need? (Threads, labels, search,
  drafts, rich text compose, attachments, contacts.)
- How does Hey.com differ from Gmail/Outlook — what UX ideas are worth adopting?
- How does email integrate with the existing Rickbait identity (RRN, key pairs)?
- Can messages be end-to-end encrypted using the existing secp256k1 keys?

### 4. Build vs buy

- What level of control do we need to deliver a first-class email experience?
- What are the operational costs and complexity tradeoffs?
- Is there a hybrid approach — e.g., use SES for SMTP transport but build our
  own storage and client?

## Experiments

### Experiment 1: Survey the SMTP/protocol landscape

Research the available options for sending and receiving email at the protocol
level. Understand what SMTP requires operationally, what managed services exist,
what open-source servers are available, and what it would take to write our own.

#### Description

Search the internet for information on each of the following categories:

1. **SMTP fundamentals** — What infrastructure is required to send and receive
   email? MX records, SPF, DKIM, DMARC, IP reputation, reverse DNS. What makes
   email deliverability hard?
2. **Cloud email services** — AWS SES, Google Workspace SMTP relay, Azure
   Communication Services. What do they handle, what do they not handle, what do
   they cost?
3. **Third-party email APIs** — SendGrid, Mailgun, Postmark, Resend.
   Capabilities for sending, receiving (inbound webhooks), pricing, limits, and
   how much control they give over the experience.
4. **Open-source SMTP servers** — Postfix, Haraka (Node.js), Stalwart (Rust),
   Maddy (Go), Mail-in-a-Box, others. What do they handle (sending, receiving,
   storage, spam filtering)? How hard are they to operate?
5. **Custom implementation** — What RFCs define SMTP? What Rust or TypeScript
   libraries exist for SMTP (lettre, nodemailer, etc.)? What is the minimum
   viable implementation for sending and receiving? Is this a week of work or
   months?

#### Output

Results are added inline below this section. A sub-section for each option (at
least 8 options covering all five categories). Each option section should
include:

- **Category** — Cloud service / Third-party API / Open-source / Custom
- **Sending** — How outbound email works (API call, SMTP relay, direct)
- **Receiving** — How inbound email works (webhook, IMAP, direct SMTP listener)
- **Ops burden** — What we have to manage ourselves
- **Cost** — Approximate pricing at small and large scale
- **Control** — How much we control the experience
- **Notes** — Key tradeoffs, gotchas, or standout features

#### Verification

Every option section has concrete answers, not placeholders. All five categories
are covered. The results are sufficient to make an informed decision about which
approach to pursue for Rickbait's email system.

#### Results

##### SMTP Fundamentals

**Sending** requires an SMTP server (MTA) plus DNS records: SPF (RFC 7208) to
authorize sending IPs, DKIM (RFC 6376) to cryptographically sign messages, and
DMARC (RFC 7489) to define policy when auth fails. The sending IP needs a valid
PTR (reverse DNS) record and must not be on blacklists (Spamhaus, Barracuda).

**Receiving** requires MX records pointing to a host running an SMTP listener on
port 25. The listener accepts messages, then hands them to storage (Maildir,
database, IMAP server).

**Deliverability is hard** because: new IPs have no reputation and must be
"warmed" gradually over weeks; blacklisting can happen from a single incident;
Gmail/Outlook track engagement signals (open rate, replies, complaints) and
degrade senders with low engagement; missing or misconfigured SPF/DKIM/DMARC
causes immediate rejection; and failing to handle bounces damages reputation.

**Key RFCs**: 5321 (SMTP), 5322 (message format), 7208 (SPF), 6376 (DKIM), 7489
(DMARC), 8461 (MTA-STS), 8314 (TLS for email), 3207 (STARTTLS).

##### AWS SES

- **Category**: Cloud service
- **Sending**: REST API or SMTP relay. $0.10/1,000 emails. Attachments $0.12/GB.
- **Receiving**: Yes. Receipt Rules route to S3, SNS, or Lambda. $0.09/1,000
  incoming chunks (256 KB each).
- **Ops burden**: DNS records, bounce/complaint handling via SNS, suppression
  list management, reputation monitoring. Sandbox starts at 200/day; must
  request production access.
- **Cost**: Low. Free tier: 3,000/month for 12 months.
- **Control**: Medium. You control routing rules but not the SMTP
  infrastructure.
- **Notes**: Best cloud option for programmatic inbound+outbound. Native AWS
  integration. DKIM auto-generated via Easy DKIM (add CNAME records).

##### Google Workspace SMTP Relay

- **Category**: Cloud service
- **Sending**: SMTP relay via `smtp-relay.gmail.com`. Requires Workspace
  subscription ($8.40-$28.70/user/month).
- **Receiving**: Full Gmail inbox (not programmable webhooks).
- **Ops burden**: DNS records, user account management.
- **Cost**: High for app use. Per-user subscription, not per-email.
- **Control**: Low. Designed for business email, not app integration.
- **Notes**: Wrong tool for this job. Not suitable for high-volume programmatic
  email. 10,000 messages/user/day limit.

##### Azure Communication Services Email

- **Category**: Cloud service
- **Sending**: REST API only. $0.00025/email + $0.00012/MB.
- **Receiving**: None. Outbound only.
- **Ops burden**: DNS records for custom domains.
- **Cost**: Very low per-email, but no inbound.
- **Control**: Low. No inbound pipeline.
- **Notes**: Eliminated — no inbound support means it cannot serve as the
  backbone of an email platform.

##### SendGrid

- **Category**: Third-party API
- **Sending**: REST API + SMTP relay.
- **Receiving**: Inbound Parse webhook — emails POSTed as JSON to your endpoint.
- **Ops burden**: DNS verification for DKIM/SPF. Dedicated IP on Pro+.
- **Cost**: No permanent free tier (60-day trial, 100/day). Essentials $19.95/mo
  (50K), Pro ~$89.95/mo (100K+).
- **Control**: Medium. Webhook-based inbound, good APIs.
- **Notes**: Mature but reputation has declined under Twilio ownership.
  Deliverability complaints have increased. Marketing tools included.

##### Mailgun

- **Category**: Third-party API
- **Sending**: REST API + SMTP relay.
- **Receiving**: Inbound routing via webhook with pattern-matching rules.
- **Ops burden**: DNS records. Route configuration.
- **Cost**: Free tier: 100/day (ongoing). Foundation $35/mo (50K), Scale $90/mo
  (100K).
- **Control**: Medium. Most flexible inbound routing of the third-party APIs.
- **Notes**: Good inbound routing flexibility. Higher pricing at low volume.

##### Postmark

- **Category**: Third-party API
- **Sending**: REST API + SMTP.
- **Receiving**: Inbound webhook — parsed email POSTed as JSON. 10 retries with
  backoff.
- **Ops burden**: DNS records. Automatic DKIM signing.
- **Cost**: Free tier: 100/month (testing only). $15/mo for 10K. Dedicated IP
  $50/mo (requires 300K/mo).
- **Control**: Medium. Transactional-only policy keeps reputation high.
- **Notes**: Best deliverability (~98%+ inbox placement, 1.2s average delivery).
  No bulk/marketing allowed by policy. Gold standard for emails that must
  arrive.

##### Resend

- **Category**: Third-party API
- **Sending**: REST API + SMTP, native SDKs.
- **Receiving**: Inbound webhook (added Nov 2025). Metadata only in webhook —
  must call API separately to fetch body/attachments. 30-day retention.
- **Ops burden**: DNS verification. Dedicated IPs on Scale plan with
  auto-warmup.
- **Cost**: Best free tier: 3,000/month. Pro $20/mo (50K), Scale $90/mo (100K).
- **Control**: Medium. Modern DX. Inbound is new and limited.
- **Notes**: Youngest platform. Best developer experience and free tier. Inbound
  is immature (metadata-only webhooks).

##### Postfix

- **Category**: Open-source
- **Sending**: Direct SMTP (MTA).
- **Receiving**: Direct SMTP listener on port 25.
- **Ops burden**: High. Configuration across many files. Must bolt on DKIM
  (OpenDKIM), spam filtering (SpamAssassin/Rspamd), IMAP (Dovecot) separately.
  OS updates, security patches, IP reputation management.
- **Cost**: Free software. Server hosting costs only.
- **Control**: Total. You own everything.
- **Notes**: Industry standard MTA since 1998. Battle-tested at massive scale.
  Requires assembling a full stack. Written in C.

##### Haraka

- **Category**: Open-source
- **Sending**: SMTP (MSA on port 587).
- **Receiving**: SMTP listener. Plugin-based processing.
- **Ops burden**: Medium. Plugin system is intuitive for Node.js developers. No
  storage — must add your own. Good built-in spam plugins (SPF, DKIM, DMARC,
  DNSBLs).
- **Cost**: Free software. Server hosting costs only.
- **Control**: High. All behavior customizable via JS plugins.
- **Notes**: Used at Craigslist for high-volume mail. Best choice for
  programmable SMTP handling in Node.js. No storage layer included.

##### Stalwart

- **Category**: Open-source
- **Sending**: SMTP.
- **Receiving**: SMTP, IMAP4, POP3, JMAP. Full mail server in one binary.
- **Ops burden**: Low relative to Postfix stack. Single binary, web admin UI.
  Built-in DKIM/SPF/DMARC/ARC, built-in spam filtering (statistical classifier,
  DNSBLs, phishing detection).
- **Cost**: Free software. Server hosting costs only.
- **Control**: Total. Full protocol support including JMAP (ideal for custom
  clients).
- **Notes**: Written in Rust. Younger project but feature-complete. JMAP support
  is a major advantage for building a custom web client. Most compelling
  all-in-one open-source option.

##### Maddy

- **Category**: Open-source
- **Sending**: SMTP.
- **Receiving**: SMTP + IMAP (beta). Single binary, single config file.
- **Ops burden**: Low. Built-in DKIM/SPF/DMARC/DANE/MTA-STS.
- **Cost**: Free software. Server hosting costs only.
- **Control**: High.
- **Notes**: Written in Go. IMAP storage is explicitly beta. Weaker spam
  filtering than Stalwart (basic DNSBL only). Better suited for personal/small
  use than a platform.

##### Custom Rust implementation

- **Category**: Custom
- **Sending**: Use `lettre` crate (mature, v0.11.19) as SMTP client, or connect
  to a relay (SES/Postmark).
- **Receiving**: Use `samotop` crate or Stalwart's SMTP components as building
  blocks. Or `smtp-server` npm package for Node.js.
- **Ops burden**: Very high initially (months of development). Ongoing: same as
  running your own SMTP (IP reputation, deliverability, spam).
- **Cost**: Development time. No licensing costs.
- **Control**: Total.
- **Notes**: Bare SMTP protocol is days of work. Full production system
  (authentication, TLS, bounce handling, queue management, spam filtering) is
  months. Most cloud providers block outbound port 25 by default — requires
  special approval. Clean IPv4 address required. The protocol is simple; the
  operational burden (deliverability, reputation) is the real cost.

##### Custom Node.js implementation

- **Category**: Custom
- **Sending**: Use Nodemailer (5M+ weekly downloads, battle-tested).
- **Receiving**: Use `smtp-server` package (from Nodemailer author). Provides
  hooks for onData, onAuth, onConnect. Handles TLS/STARTTLS.
- **Ops burden**: Same as Rust custom — high.
- **Cost**: Development time.
- **Control**: Total.
- **Notes**: Both libraries are production-ready building blocks. Faster to
  prototype than Rust. Same operational challenges apply. For high volume,
  dedicated services are recommended over self-managed SMTP.

### Experiment 2: Survey message storage options

Research how to store email messages, metadata, and attachments for a custom
web-based email client. We are not using an existing mail server's storage
(Stalwart, Dovecot) — we will own the schema and store messages in our own
database. The question is which database and what schema patterns work best.

#### Description

Search the internet for information on each of the following:

1. **MySQL/Vitess for email** — Can a relational database handle email at scale?
   What schema patterns exist for messages, threads, labels, and folders? How do
   you model many-to-many relationships (message ↔ labels)? What are the
   performance characteristics for inbox queries (list messages, search, thread
   view)? How does Gmail's Bigtable-backed storage compare to a relational
   approach? Are there examples of email systems built on MySQL?

2. **Full-text search** — MySQL has built-in full-text indexing. Is it good
   enough for email search, or do you need a dedicated search engine? Compare:
   MySQL FULLTEXT, PostgreSQL full-text search (tsvector), Meilisearch,
   Typesense, Elasticsearch/OpenSearch. What are the tradeoffs for a solo
   operator (ops burden vs search quality)?

3. **Attachment storage** — Should attachments live in the database (blobs), in
   object storage (S3, R2, GCS), or a hybrid? What are the size limits and
   performance implications of each? How do existing email systems handle
   attachments?

4. **Alternative databases** — Would ScyllaDB (Cassandra-compatible),
   PostgreSQL, or another database be better suited for email than MySQL? What
   are the tradeoffs for each in the context of message storage, threading, and
   search? Consider that we are already using MySQL/Vitess/PlanetScale for the
   rest of the app.

5. **Existing patterns** — How do open-source webmail clients (Roundcube,
   Rainloop) and modern email apps (Hey.com, Superhuman) store messages? Are
   there published schema designs or architecture posts?

#### Output

Results are added inline below this section. A sub-section for each topic area
with concrete findings. Each should cover what works, what doesn't, and what the
tradeoffs are for Rickbait's use case (MySQL/Vitess as primary database, solo
operator, must scale).

#### Verification

All five topic areas have concrete findings. The results are sufficient to
decide: (a) which database to use for message storage, (b) whether to add a
separate search index, (c) how to handle attachments, and (d) what the core
schema should look like.

#### Results

##### MySQL/Vitess for email

MySQL can handle email metadata well — sender, subject, timestamps, flags,
thread IDs. However, email bodies should be stored externally (object storage)
as they consume 60%+ of database size and cause replica lag and backup problems.

Standard relational schema uses four core tables:

- **messages** — `id`, `thread_id`, `sender_id`, `subject`, `snippet`,
  `body_url` (pointer to object storage), `message_id_header` (RFC 2822),
  `in_reply_to`, `received_at`, `is_read`, `is_starred`
- **threads** — `id`, `subject`, `last_message_at`, `message_count`
- **labels** — `id`, `user_id`, `name`, `type` (system/user), `color`
- **message_labels** — `message_id`, `label_id` (composite PK)

Performance: index on `(user_id, received_at DESC)` for inbox listing, index on
`(thread_id, received_at)` for thread view, join through `message_labels` for
label filtering. Partitioning by `received_at` keeps the working set small. At
tens of millions of messages these queries remain fast with proper indexing.
Beyond hundreds of millions per shard, horizontal sharding by user ID is needed
(which Vitess handles).

**Threading**: The JWZ algorithm (Jamie Zawinski) uses `Message-ID`,
`References`, and `In-Reply-To` headers to reconstruct threads. In practice,
resolve threading at write time: look up the root Message-ID from `References`
to find or create a `thread_id`, assign it to the message. Index
`(thread_id, received_at)` for thread view queries.

Gmail uses Bigtable (wide-column NoSQL) on Colossus (distributed filesystem) —
not relational. But Google has publicly stated that users ultimately want SQL,
distributed transactions, and synchronous replication. For sub-exabyte scale,
a well-indexed MySQL schema provides what Google built custom infrastructure for.

Slack stores all messages in Vitess/MySQL at 2.3M QPS. This validates that
MySQL/Vitess can handle messaging workloads at scale.

##### Full-text search

**MySQL FULLTEXT** — Built-in, zero extra infrastructure. Supports natural
language and boolean modes. Good enough for under ~10M rows. No relevance tuning,
no stemming customization, no typo tolerance, no highlighting. Performance
degrades past a few million rows with large text fields. Viable for MVP, will be
outgrown.

**PostgreSQL tsvector/tsquery** — Much richer than MySQL: language-aware stemming,
weights (subject vs body), prefix matching, custom stop words. GIN indexes
perform well into tens of millions of rows. No extra service to run. No typo
tolerance or faceting. Strong choice for a solo operator, but requires running a
second database.

**Meilisearch** — Rust-based, typo-tolerant, instant search (<50ms). Single
binary, simple REST API, built-in highlighting. RAM-hungry (memory-mapped
indexes). Document size limit ~2MB (fine for email). Must sync data from primary
DB. No built-in clustering in open source. Cloud starts ~$30/mo. Excellent
search UX, manageable for a solo operator.

**Typesense** — C++-based, similar to Meilisearch. Built-in HA/clustering
(Raft consensus), slightly lower memory usage. Cloud starts ~$30/mo. Same
data-sync requirement. Comparable search quality with better operational story
(clustering without paid tier).

**Elasticsearch/OpenSearch** — Industry standard. Handles any scale and query
complexity. Percolation (saved searches matching incoming email) is ideal for
email alerts. Operationally heavy — JVM tuning, cluster management, 3+ nodes.
Managed options start ~$100/mo. Overkill for under 10M documents. Only justified
at serious scale.

**Recommendation**: Start with MySQL FULLTEXT for MVP. Add Meilisearch or
Typesense when search quality becomes a differentiator.

##### Attachment storage

**MySQL BLOBs** — Technically supports up to 4GB (LONGBLOB). But BLOBs force
disk-based temp tables, balloon backups, slow replication, and require
`max_allowed_packet` tuning. Not viable past tens of thousands of large
attachments. Must isolate BLOBs in a separate table if used at all.

**Object storage (S3/R2/GCS)** — The industry standard. Store file in a bucket
keyed by `attachments/{message_id}/{uuid}`, store the key + metadata (filename,
MIME type, size) in a database row. Presigned URLs let clients download directly
from the bucket, offloading app servers. S3: ~$0.023/GB/mo storage + $0.09/GB
egress. **Cloudflare R2**: ~$0.015/GB/mo storage, **zero egress fees** — much
cheaper for read-heavy workloads like email attachments.

**Hybrid (metadata in DB, files in object storage)** — What virtually every
modern email system does. Database stays lean and fast for queries. Object
storage handles durability and throughput. This is the only viable approach at
scale.

**How existing systems do it**: Dovecot uses filesystem (Maildir) with optional
S3/Ceph plugins. Gmail uses Bigtable pointers to Colossus (distributed
filesystem). Roundcube and Zimbra use hybrid DB + filesystem.

**At scale**: 1M users × 500MB attachments = 500TB. R2 cost: ~$7,500/mo storage,
$0 egress. S3 with moderate egress: $15,000+/mo.

**Recommendation**: Metadata in MySQL, files in Cloudflare R2 (zero egress).

##### Alternative databases

**PostgreSQL** — Strongest alternative. Built-in full-text search (tsvector),
JSONB for flexible metadata, array types for labels. GIN indexes on both make
inbox listing, label filtering, and search efficient in one system. But adding a
second database increases operational burden. Drizzle ORM supports Postgres if
migration is needed.

**ScyllaDB** — Optimized for high-throughput append workloads (Discord uses it
for chat). But no joins, rigid query-pattern requirements, no built-in full-text
search, operationally heavy (multiple nodes, compaction tuning). Not worth it
unless expecting billions of messages.

**MongoDB** — Email maps naturally to documents, 16MB doc limit accommodates
most messages. Atlas Search provides full-text search. But lacks efficient
relational queries for threading and label filtering. No clear advantage over
Postgres.

**Sticking with MySQL/PlanetScale** — Zero additional operational burden. MySQL
FULLTEXT covers basic search. Slack validates Vitess/MySQL for messaging at
2.3M QPS. Main limitation: weaker full-text search than Postgres, no native
JSONB.

**Recommendation**: Stick with MySQL/PlanetScale. Add Meilisearch for search
later rather than a second primary database. If starting fresh with no existing
MySQL commitment, Postgres would be the better single-database choice.

##### Existing patterns

**Roundcube / SnappyMail** — Pure IMAP clients. Store no messages themselves.
All mail lives on the IMAP server. Local DB holds only user settings and cached
metadata. Not relevant as a storage reference.

**Hey.com (37signals)** — Built on Rails using Action Mailbox. Stores inbound
emails as ActiveRecord records with the raw `.eml` file in Active Storage
(cloud object storage). DB tracks status, message_id, checksum. Pattern:
**metadata in relational DB, raw message blobs in object storage**. Emails are
"incinerated" (deleted) after processing by default.

**Superhuman** — An IMAP client (connects to Gmail/Outlook), not its own mail
server. Distinctive for offline-first architecture: email data stored in
IndexedDB in the browser, attachments in CacheStorage via ServiceWorkers.
Search runs entirely in-browser.

**ProtonMail** — All messages stored with zero-access encryption. Incoming mail
from non-Proton senders encrypted with recipient's public key on arrival.
Between Proton users, E2E encrypted. Private key encrypted with AES-256 using
password-derived key (bcrypt). Pattern: **encrypted blobs on server, decryption
only on-device**. Directly relevant to Rickbait's secp256k1 key pairs.

**Tuta** — Similar to ProtonMail: entire mailbox E2E encrypted. Uses AES-256
symmetric + asymmetric encryption (RSA-2048, post-quantum TutaCrypt since 2024).
Built their own protocol (not PGP) to encrypt subject lines and more metadata.

**JMAP (RFC 8621)** — Modern JSON-over-HTTP replacement for IMAP. Defines the
best-documented email data model available:

- **Email**: id, blobId, threadId, mailboxIds (set — supports both folders and
  labels), keywords ($seen, $flagged, etc.), size, receivedAt, sentAt,
  messageId, inReplyTo, references, from, to, cc, bcc, subject, hasAttachment,
  preview, textBody, htmlBody, attachments, headers
- **Mailbox**: id, name, parentId, role, sortOrder, totalEmails, unreadEmails,
  totalThreads, unreadThreads
- **Thread**: id, emailIds (ordered list)
- **EmailSubmission**: for sending

The `mailboxIds` design (email belongs to a set of mailboxes) elegantly supports
both folder and label semantics. JMAP's Email object is the best starting point
for a database schema.

**Recommendation**: Use the JMAP Email data model as the schema reference.
Follow Hey.com's pattern: metadata in MySQL, raw messages/bodies in object
storage (R2). For E2E encryption, follow ProtonMail/Tuta's pattern using
Rickbait's existing secp256k1 key pairs.

## Conclusion

After researching SMTP infrastructure, message storage, and hosting options, the
architecture for Rickbait email is:

### Hosting

**Spinservers dedicated server in Dallas** ($85/mo). Bare metal gives us full
control over the stack, including running our own SMTP server on port 25 with a
dedicated IP. This follows the 37signals/Hey.com model of owning the
infrastructure. If bare metal proves too much operational work, we can fall back
to AWS (SES + Fargate + S3).

### Tech stack

```
Spinservers ($85/mo, 20-core Xeon, 32GB RAM, 1TB NVMe)
├── Bun + TanStack Start       (web app)
├── Postfix                     (SMTP send/receive)
├── rspamd + Redis              (spam filtering, DKIM/SPF/DMARC signing/verification)
├── MySQL                       (relational data + SeaweedFS filer metadata)
├── SeaweedFS                   (all blob storage: email bodies, attachments, repo files)
└── Backups: rclone → Backblaze B2
```

### Why these choices

**Postfix** — Industry-standard MTA, 27 years old, used by Hey.com. Handles all
SMTP protocol complexity. The `pipe` transport hands raw emails to our Bun
script for custom processing and storage. We don't have to implement SMTP.

**rspamd** — Used by Hey.com alongside Postfix. Handles spam filtering, DKIM
signing/verification, SPF, DMARC, ARC, greylisting, rate limiting. 10x faster
than SpamAssassin. Integrates with Postfix via milter protocol. Needs Redis for
statistics and Bayes learning.

**MySQL** — Already our primary database. Handles email metadata (sender,
subject, timestamps, thread IDs, labels). Schema modeled after JMAP (RFC 8621)
data model. Full-text search via FULLTEXT indexes for MVP, upgrade to
Meilisearch later if needed. Slack runs on MySQL/Vitess at 2.3M QPS, validating
MySQL for messaging workloads. Scale path: MySQL → Vitess sharding by user ID.

**SeaweedFS** — S3-compatible object storage on bare metal, Apache 2.0 licensed,
actively maintained. Stores email bodies, attachments, and future repository
files (large file versioning). Filer metadata stored in our existing MySQL. S3
API means code is portable to real S3 if we ever leave bare metal. Replaces the
need for S3/R2/MinIO. MinIO was the previous standard but its open-source
edition was archived in February 2026.

**Backblaze B2** — Off-site backup at $0.005/GB/month. rclone syncs SeaweedFS
data and MySQL dumps on a schedule.

### Email flow

**Inbound**: sender → Postfix (port 25) → rspamd (spam/auth check) → pipe to
Bun script → parse email → store metadata in MySQL, body/attachments in
SeaweedFS → user sees it in web client.

**Outbound**: user composes → Bun server function → store in MySQL → hand to
Postfix → rspamd (DKIM sign) → deliver to recipient.

### What we don't need

- SES, SendGrid, or any managed email service (Postfix handles SMTP)
- Cloud hosting (bare metal is cheaper and gives full control)
- IMAP/Dovecot (web client reads directly from MySQL)
- Separate search engine for MVP (MySQL FULLTEXT)
- S3/R2/MinIO (SeaweedFS on local disks)

### Scale path

1. **Single server**: MySQL + SeaweedFS on one Spinservers box
2. **Replication**: Add second Spinservers box, SeaweedFS replicates
   automatically, MySQL replica for reads
3. **Sharding**: MySQL → Vitess, shard by user ID
4. **Search**: Add Meilisearch when FULLTEXT isn't enough
5. **Attachments at scale**: SeaweedFS cloud tiering to Backblaze B2 for old data

### E2E encryption

Users already have secp256k1 key pairs. Follow ProtonMail/Tuta pattern: encrypt
email bodies with recipient's public key before storage. Decryption happens
client-side. Server never sees plaintext.

### DNS requirements

- MX record → Spinservers IP
- SPF TXT record authorizing the server IP
- DKIM TXT record (rspamd generates the key)
- DMARC TXT record with policy
- PTR/rDNS record (request from Spinservers)

### Cost

- Spinservers: $85/month
- Backblaze B2 backup: ~$5/month
- Domain/DNS: already owned
- **Total: ~$90/month**
