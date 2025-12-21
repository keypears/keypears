# KeyPears Business Plan

## Executive Summary

**Decentralized Vault Hosting for the Modern Web**

KeyPears is a **decentralized password manager and cryptocurrency wallet** with
an email-like architecture. Users create vaults in the format
`alice@keypears.com` (or any custom domain), enabling cross-device
synchronization and secure secret sharing between any two addresses (e.g.,
`alice@keypears.com` ↔ `bob@company.com`). Unlike traditional password managers
locked to a single provider, KeyPears is **open source, federated, and
zero-knowledge encrypted**.

**Key Innovation**: **Vault hosting** - similar to email hosting services like
HEY.com or ProtonMail, KeyPears allows custom domain hosting
(`alice@yourdomain.com`) while maintaining zero-knowledge encryption. Even
metadata (domain names, usernames) is encrypted on the server.

The code is licensed under **Apache 2.0**, while the **KeyPears** brand and
hosted services are owned by **Identellica LLC**.

KeyPears' unique model combines:

- **Vault hosting with custom domains**: Use `alice@yourdomain.com` hosted by
  keypears.com (like custom email domains)
- **Zero-knowledge + encrypted metadata**: Server cannot see secret metadata
  (domain, username) or data (passwords)
- **Freemium with generous limits**: Cost-based free tier covers 95%+ of users
- **Premium custom domains**: $9/month ($99/year) for custom domain hosting +
  unlimited usage
- **Business multi-user hosting**: $9/month base + $5/user/month for team vault
  management
- **Open-source federation**: Anyone can run their own KeyPears server (Apache
  2.0)
- **Cryptocurrency wallet integration**: Self-custody wallet keys with secure DH
  key exchange

Marketing will be **100% text-based**, focusing on developer and crypto
communities: Reddit, X/Twitter, blogs, newsletters, and forums.

---

## Market Opportunity

- **Password Manager Market**: ~$3.1B by 2027, growing at 15% CAGR
  - 1Password, Bitwarden, LastPass dominate but lack true decentralization
  - No competitor offers custom domain hosting for vaults
- **Cryptocurrency Wallet Market**: Multi-billion dollar market with
  self-custody demand
  - KeyPears differentiator: vault-based key management with DH secret sharing
- **Secrets Management / DevSecOps**: $2B+ market (HashiCorp Vault, Doppler)
  - Teams need secure credential sharing without enterprise complexity
- **Decentralized Identity & Key Exchange**: Growing need for federated systems
  without central authorities
- **Unique Positioning**: First vault hosting service with encrypted metadata,
  custom domains, and email-like federation

---

## Target Audiences

### Phase 1: Individual Users (Months 0-12)

- **Crypto Users** — Self-custody wallet keys, secure sharing between addresses,
  DH key exchange
- **Privacy-Conscious Consumers** — Zero-knowledge encryption, encrypted
  metadata, open source
- **Tech Early Adopters** — Custom domain support, federated architecture,
  email-like vault addresses

### Phase 2: Teams & Developers (Months 12-24)

- **Small Teams & Startups** — Secure API key sharing, team credential
  management, affordable pricing
- **Developers** — Self-hostable, open source, API-first design, text-based
  marketing resonates

### Phase 3: Enterprise (Months 24+)

- **Enterprises** — Compliance-ready, self-hostable, federated, encrypted
  metadata for regulatory requirements
- **Cryptocurrency Companies** — Wallet key management for teams, multi-sig
  coordination

---

## Business Model: Vault Hosting (Email-Style Freemium)

### Free Tier: $0/month

**Hosted at**: `@keypears.com` or `@passapples.com`

**Generous limits based on actual server costs**:

- ✅ **300 syncs/month** (~10/day across all devices)
- ✅ **50 secret shares/month** (~1.6/day for personal sharing)
- ✅ **500 secrets maximum** (average user has ~80 passwords)
- ✅ **1GB encrypted storage** (future-proofing for file attachments)
- ✅ **Unlimited devices** (mobile, desktop, tablet)
- ✅ **Zero-knowledge encryption** (server cannot see secret data or metadata)

**Cost per free user**: ~$0.04/month average (at 30% limit usage), ~$0.13/month
at full limits

**Target**: 95%+ of users stay on free tier forever

**Why this works**:

- Limits are 10x more generous than minimum viable usage
- Normal users use ~30% of limits (100 syncs/month, 5 shares/month, 100 secrets)
- Only true power users hit limits
- Sustainable at scale (10,000 free users = ~$400/month server costs)

### Premium Tier: $9/month ($99/year annual, 17% discount)

**Hosted at**: Custom domain (e.g., `alice@ryanxcharles.com` hosted by
keypears.com)

**Premium Features**:

- ✅ **Custom domain support** - Use your own domain via
  `.well-known/keypears.json` protocol
- ✅ **Unlimited syncs** - No sync operation limits
- ✅ **Unlimited secret sharing** - Share secrets without monthly caps
- ✅ **Unlimited secrets** - Store as many as needed (no 500 secret cap)
- ✅ **10GB encrypted storage** - For future file attachments, documents
- ✅ **Priority support** - Email support within 24 hours
- ✅ **Advanced features** - Audit logs (client-side encrypted), export, backup
- ✅ **Early access** - New features before free tier

**Why $9/month ($99/year)**:

- Custom domain hosting is premium feature requiring infrastructure investment
- Covers server costs even for heavy users (~$0.80/month worst case = **91%
  profit margin**)
- Premium positioning signals quality and long-term value
- Annual pricing ($99/year) encourages yearly commitments and better retention
- Future-proof pricing allows feature additions without price increases
- Still competitive: $99/year vs 1Password ($36/year) + custom domain value

**Target conversion**: 4-5% of free users upgrade to premium

### Business Tier: $9/month base + $5/user/month (or $99/year base + $60/user/year)

**Hosted at**: Custom domain (e.g., `team@company.com` hosted by keypears.com)

**Business Features**:

- ✅ Everything in Premium tier
- ✅ **Multi-user management** - Multiple vault accounts under one domain
- ✅ **Admin dashboard** - User provisioning, access control, usage monitoring
- ✅ **Team vault sharing** - Shared credential collections for teams
- ✅ **SLA guarantee** - 99.9% uptime commitment
- ✅ **Compliance features** - Audit logs, access reports, activity tracking
- ✅ **Priority support** - 12-hour email response, dedicated account manager at
  50+ users

**Pricing examples**:

- 5-user team: $9 + ($5 × 5) = **$34/month** (~$6.80/user) or **$399/year**
- 10-user team: $9 + ($5 × 10) = **$59/month** (~$5.90/user) or **$699/year**
- 50-user team: $9 + ($5 × 50) = **$259/month** (~$5.18/user) or **$3,099/year**

**Why this structure**:

- Base fee covers domain setup, DNS configuration, proof generation overhead
- Per-user pricing scales with actual server costs
- Competitive with Bitwarden Teams ($3/user), 1Password Business ($7.99/user)
- Companies expect to pay for custom branded domains

**Target**: 20-50 small business customers by Year 2

---

## Custom Domain Protocol: `.well-known/keypears.json`

### Technical Implementation

KeyPears uses a federated domain discovery protocol similar to
Matrix/ActivityPub:

**Domain Configuration File**:
`https://yourdomain.com/.well-known/keypears.json`

```json
{
  "version": "1.0",
  "api": "https://keypears.com/api",
  "domain": "yourdomain.com",
  "proof": "kp_live_1a2b3c4d5e6f7g8h9i0j...",
  "created_at": "2025-11-26T12:00:00Z",
  "expires_at": "2026-11-26T12:00:00Z"
}
```

**Fields**:

- `version`: Protocol version (semver, allows future upgrades)
- `api`: KeyPears API endpoint hosting this domain's vaults
- `domain`: The domain being hosted (prevents domain spoofing)
- `proof`: Cryptographic proof of ownership (HMAC-Blake3 signature by hosting
  provider)
- `created_at`: When domain was linked to hosting provider
- `expires_at`: Proof expiration (forces periodic revalidation, prevents
  abandoned domain hijacking)

**Security Model**:

1. User controls DNS → can add `.well-known/keypears.json` file
2. Hosting provider (keypears.com) signs proof with server secret key
3. Client verifies proof with hosting provider's public API
4. Expiration forces annual renewal (prevents stale configurations)

**User Flow** (Premium user adding custom domain):

1. User upgrades to Premium ($4.99/month)
2. User enters domain: `ryanxcharles.com`
3. KeyPears generates signed proof and shows instructions
4. User uploads `.well-known/keypears.json` to their domain (via Cloudflare
   Pages, Vercel, Netlify, or any static host)
5. User clicks "Verify Domain"
6. Client fetches file, verifies proof with keypears.com API
7. Success: User can now create vaults like `alice@ryanxcharles.com`

**Why This Works**:

- **Federated**: Any domain can host vaults at any KeyPears-compatible API
  endpoint
- **Decentralized**: No central authority controls domain-to-provider mappings
- **Secure**: Cryptographic proof prevents spoofing
- **Open protocol**: Anyone can implement a KeyPears hosting provider
- **Email-compatible**: Future email clients could support KeyPears protocol for
  secure attachments

---

## Revenue Model & Unit Economics

### Cost Analysis (Per User)

**Average User** (10 syncs/day, 1 share/week, 100 secrets):

- Storage: $0.000023/month (PostgreSQL)
- Compute: $0.015/month (Fargate CPU time)
- Transfer: $0.0005/month (data transfer)
- **Total cost: ~$0.016/month**

**Power User** (100 syncs/day, 10 shares/day, 1,000 secrets):

- Storage: $0.00023/month
- Compute: $0.15/month
- Transfer: $0.005/month
- Sharing: $0.0045/month
- **Total cost: ~$0.16/month**

**Heavy Power User** (500 syncs/day, 50 shares/day, 5,000 secrets):

- Storage: $0.0012/month
- Compute: $0.75/month
- Transfer: $0.025/month
- Sharing: $0.0225/month
- **Total cost: ~$0.80/month**

**Premium Tier Profit Margins**:

- Premium at $9/month ($108/year)
- Average user cost: $0.016/month → **99.8% profit margin**
- Power user cost: $0.16/month → **98.2% profit margin**
- Heavy power user cost: $0.80/month → **91% profit margin**

**Conclusion**: Even heavy power users are highly profitable at $9/month premium
pricing.

### Revenue Projections

#### Year 1: MVP Launch + Early Adopters

**Users**:

- 1,000 free users
- 25 premium users (2.5% conversion)
- 0 business customers

**Costs**:

- Free users: ~$16/month (1,000 × $0.016)
- Premium users: ~$4/month (25 × $0.16 heavy usage assumption)
- Infrastructure: ~$70/month (Fargate + RDS + ALB)
- **Total costs: ~$90/month = $1,080/year**

**Revenue**:

- Premium: $225/month (25 × $9) = **$2,700/year**

**Profit**: ~$1,620/year (profitable in Year 1)

#### Year 2: Growth Phase

**Users**:

- 10,000 free users
- 500 premium users (5% conversion)
- 5 business teams (10 users avg)

**Costs**:

- Free users: ~$160/month
- Premium users: ~$80/month (500 × $0.16)
- Business users: ~$25/month (50 × $0.50 moderate usage)
- Infrastructure: ~$200/month (scaled Fargate + RDS)
- **Total costs: ~$465/month = $5,580/year**

**Revenue**:

- Premium: $4,500/month (500 × $9) = $54,000/year
- Business: $295/month (5 × $59) = $3,540/year
- **Total revenue: $57,540/year**

**Profit**: ~$51,960/year (90% profit margin)

#### Year 3: Scale & Profitability

**Users**:

- 100,000 free users
- 5,000 premium users (5% conversion)
- 50 business teams (15 users avg)

**Costs**:

- Free users: ~$1,600/month
- Premium users: ~$800/month (5,000 × $0.16)
- Business users: ~$375/month (750 × $0.50)
- Infrastructure: ~$1,500/month (multi-region, redundancy)
- **Total costs: ~$4,275/month = $51,300/year**

**Revenue**:

- Premium: $45,000/month (5,000 × $9) = $540,000/year
- Business: $4,400/month (50 × $88 avg) = $52,800/year
- **Total revenue: $592,800/year**

**Profit**: ~$541,500/year (91% profit margin)

#### Year 5: Mature SaaS

**Users**:

- 500,000 free users
- 25,000 premium users (5% conversion)
- 250 business teams (20 users avg)

**Costs**:

- Free users: ~$8,000/month
- Premium users: ~$4,000/month
- Business users: ~$2,500/month (5,000 × $0.50)
- Infrastructure: ~$10,000/month (global CDN, multi-region)
- **Total costs: ~$24,500/month = $294,000/year**

**Revenue**:

- Premium: $225,000/month (25,000 × $9) = $2,700,000/year
- Business: $28,000/month (250 × $112 avg) = $336,000/year
- **Total revenue: $3,036,000/year**

**Profit**: ~$2,742,000/year (90% profit margin)

**ARR**: ~$3M at 500,000 free users (achievable with viral growth in crypto
community)

---

## Marketing Strategy (Text-Only)

### Core Channels

**Reddit** (Primary):

- /r/cryptocurrency, /r/privacy, /r/selfhosted, /r/programming, /r/bitcoin
- Strategy: Thoughtful posts about decentralization, zero-knowledge encryption,
  custom domains
- Expected: 50k-100k impressions per viral post

**X/Twitter**:

- Crypto Twitter, InfoSec Twitter, Developer Twitter
- Strategy: Short technical threads, "custom domains for password vaults" hooks
- Expected: 100k-500k impressions with crypto influencer engagement

**Hacker News**:

- "Show HN: KeyPears - Custom Domain Password Manager with Encrypted Metadata"
- Strategy: Technical deep-dive post, engage in comments
- Expected: 50k-200k impressions if frontpage

**Blogs & Newsletters**:

- Write technical posts: "Why Password Managers Need Custom Domains," "Email for
  Secrets"
- Partner with crypto/OSS newsletters (Bitcoin Magazine, Unsupervised Learning)
- Expected: 10k-50k targeted impressions per article

### Messaging & Positioning

**Core Value Props**:

1. "Custom domains for your password vault - like custom email domains"
2. "Zero-knowledge encryption + encrypted metadata (even domain names
   encrypted)"
3. "Open source, self-hostable, federated (like email for secrets)"
4. "Built for cryptocurrency self-custody"

**Viral Hooks**:

- "Your password manager doesn't let you use your own domain. Ours does."
- "Custom domain vault hosting - $99/year"
- "alice@yourdomain.com for your passwords"
- "Open source password manager with custom domain support"

**Differentiation**:

- vs. 1Password: "We're open source and support custom domains"
- vs. Bitwarden: "We encrypt metadata, they don't"
- vs. LastPass: "We're decentralized and zero-knowledge by design"
- vs. Self-hosting: "Get custom domain hosting without running your own server"

### Growth Strategy

**Phase 1: Crypto Community (Months 0-6)**

- Launch on crypto subreddits and Twitter
- Emphasize cryptocurrency wallet key management
- Target early adopters who value self-custody
- Goal: 1,000 users, 25 premium

**Phase 2: Privacy & Developer Community (Months 6-12)**

- Launch on privacy and selfhosted subreddits
- Write technical deep-dives about encrypted metadata
- Show off custom domain protocol (`.well-known/keypears.json`)
- Goal: 10,000 users, 250 premium

**Phase 3: Mainstream & Teams (Months 12-24)**

- Business tier marketing to small teams
- Case studies: "How [Startup] uses custom domain vaults"
- SEO: "custom domain password manager," "encrypted metadata password manager"
- Goal: 100,000 users, 5,000 premium, 50 business teams

**Phase 4: Enterprise (Months 24+)**

- Self-hosted enterprise deployments
- White-label hosting services
- Compliance & audit feature marketing
- Goal: 500,000+ users, 25,000+ premium, 250+ business teams

---

## Competitive Analysis

### Direct Competitors (Password Managers)

| Feature                | KeyPears      | Bitwarden | 1Password     | LastPass |
| ---------------------- | ------------- | --------- | ------------- | -------- |
| **Price (Individual)** | $99/year      | $10/year  | $2.99/month   | $3/month |
| **Custom Domains**     | ✅ Yes        | ❌ No     | ❌ No         | ❌ No    |
| **Encrypted Metadata** | ✅ Yes        | ❌ No     | ❌ No         | ❌ No    |
| **Open Source**        | ✅ Apache 2.0 | ✅ GPL    | ❌ No         | ❌ No    |
| **Self-Hostable**      | ✅ Yes        | ✅ Yes    | ❌ No         | ❌ No    |
| **Federated**          | ✅ Yes        | ❌ No     | ❌ No         | ❌ No    |
| **Crypto Wallet**      | ✅ Yes        | ❌ No     | ❌ No         | ❌ No    |
| **Free Tier**          | Generous      | Generous  | ❌ Trial only | Limited  |

**KeyPears Advantages**:

- Only password manager with custom domain support
- Only password manager with encrypted metadata on server
- Federated architecture (email-like, cross-domain secret sharing)
- Built-in cryptocurrency wallet key management
- Apache 2.0 (more permissive than GPL)

**Bitwarden Advantages**:

- Cheaper premium ($10/year vs $50/year)
- More mature product (established brand)
- Larger user base

**1Password Advantages**:

- Strong brand recognition
- Excellent UX/UI polish
- Enterprise features

**LastPass Advantages**:

- Brand recognition
- Large existing user base

### Indirect Competitors (Crypto Wallets)

| Feature                 | KeyPears | MetaMask | Ledger    | Coinbase Wallet |
| ----------------------- | -------- | -------- | --------- | --------------- |
| **Self-Custody**        | ✅ Yes   | ✅ Yes   | ✅ Yes    | ⚠️ Partial       |
| **Password Manager**    | ✅ Yes   | ❌ No    | ❌ No     | ❌ No           |
| **Secret Sharing (DH)** | ✅ Yes   | ❌ No    | ❌ No     | ❌ No           |
| **Multi-Device Sync**   | ✅ Yes   | ⚠️ Manual | ❌ No     | ✅ Yes          |
| **Open Source**         | ✅ Yes   | ✅ Yes   | ⚠️ Partial | ❌ No           |

**KeyPears Advantages**:

- Unified password manager + crypto wallet
- Cross-device sync with zero-knowledge encryption
- DH key exchange for secure secret sharing
- Federated architecture (not single company)

---

## Risks & Mitigations

### Risk 1: User Adoption (Custom Domains Not Understood)

**Risk**: Users may not understand custom domain value proposition

**Mitigation**:

- Free tier doesn't require understanding (works like normal password manager)
- Premium users are tech-savvy (self-select)
- Clear onboarding: "Use your own domain like email"
- Video tutorials for domain setup

### Risk 2: Technical Complexity (Domain Setup Friction)

**Risk**: Uploading `.well-known/keypears.json` may be too technical for some
users

**Mitigation**:

- Provide one-click integrations for popular hosts (Cloudflare Pages, Vercel,
  Netlify)
- Offer "KeyPears-hosted subdomain" option (e.g.,
  `alice@alice.keypears-hosted.com`)
- Premium support helps with setup (24-hour email response)
- Only premium users need custom domains (free tier works without setup)

### Risk 3: Competition from Established Players

**Risk**: Bitwarden or 1Password could add custom domain support

**Mitigation**:

- First-mover advantage in custom domain + encrypted metadata space
- Open source + Apache 2.0 creates community moat
- Federated architecture is difficult for centralized players to retrofit
- Focus on crypto wallet integration (not their core competency)

### Risk 4: Server Costs Scale Faster Than Revenue

**Risk**: Free tier costs grow faster than premium conversions

**Mitigation**:

- Free tier limits are cost-based (300 syncs/month prevents abuse)
- Premium conversion rate (5%) is conservative vs industry (5-10%)
- Profit margins are 85%+ even at heavy usage
- Can adjust free tier limits if costs exceed projections

### Risk 5: Security Breach or Vulnerability

**Risk**: Security incident damages trust in password manager

**Mitigation**:

- Zero-knowledge architecture limits blast radius (server breach reveals
  nothing)
- Open source allows community security audits
- Bug bounty program for responsible disclosure
- Publish security audits annually
- Encrypted metadata means even domain names are protected

---

## Fundraising Strategy

### Bootstrap Phase (Months 0-12)

**Goal**: Reach profitability on personal funds before seeking investment

**Milestones**:

- Launch MVP with sync + DH key exchange
- 1,000 free users, 25 premium users
- $2,700/year revenue (profitable)
- Validate product-market fit

**Funding**: Personal funds (~$10k for 12 months runway)

### Seed Round (Months 12-18, Optional)

**Goal**: Accelerate growth if product-market fit is strong

**Target**: $250k-$500k at $2M-$3M valuation

**Use of Funds**:

- Marketing: $100k (crypto influencer partnerships, conference sponsorships)
- Engineering: $100k (hire 1-2 developers)
- Infrastructure: $50k (multi-region deployment, CDN)
- Runway: $200k (12-18 months additional runway)

**Target Investors**:

- Crypto-focused VCs (Paradigm, Dragonfly, Placeholder)
- Open source-friendly funds (OSS Capital)
- Privacy-focused angels (Signal investors, Proton investors)

**Traction Required**:

- 10,000+ users
- 500+ premium users ($54k ARR)
- Strong month-over-month growth (20%+)
- Active GitHub community

### Series A (Months 24-36, Optional)

**Goal**: Scale to mainstream adoption

**Target**: $2M-$5M at $10M-$15M post-money valuation

**Use of Funds**:

- Sales & marketing: $1M
- Engineering team: $1M (hire 5-10 developers)
- Enterprise features: $500k
- Infrastructure: $500k

**Traction Required**:

- 100,000+ users
- 5,000+ premium users ($540k ARR)
- 50+ business customers
- Clear path to $1M ARR

---

## Summary & Vision

KeyPears is positioned to become the **decentralized standard for vault
hosting** with custom domain support, encrypted metadata, and cryptocurrency
wallet integration.

**Short-Term (0-12 months)**:

- Launch MVP with sync + DH key exchange + custom domain protocol
- Bootstrap to profitability (25 premium users = $2,700/year)
- Validate product-market fit in crypto community

**Medium-Term (12-24 months)**:

- Scale to 10,000+ users through text-based marketing
- 500 premium users = $54k ARR
- Launch business tier for teams
- Optional seed funding to accelerate growth

**Long-Term (3-5 years)**:

- Become the standard for custom domain vault hosting
- 500,000+ users, $3M ARR
- Multiple official domains (keypears.com, passapples.com)
- White-label hosting services for enterprises
- Future expansion into additional secure communication features

**Vision**: Just as email evolved from centralized services (AOL, Hotmail) to
federated protocol (anyone can host, custom domains standard), KeyPears will
bring the same decentralization to password management and cryptocurrency
wallets.

**Unique Moat**:

- First custom domain password manager
- Encrypted metadata (even domain names encrypted)
- Federated architecture (email-like)
- Open source (Apache 2.0) with commercial hosting
- Cryptocurrency wallet integration

KeyPears has the potential to be both a **profitable bootstrapped SaaS** ($3M
ARR by Year 5) and a **category-defining protocol** for decentralized vault
hosting.
