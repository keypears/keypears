# Infrastructure

Production deployment for KeyPears, managed entirely with Terraform.

## Architecture

```
Internet
  │
  ▼
AWS WAF (rate limiting, IP blocking)
  │
  ▼
Application Load Balancer (HTTPS termination)
  │
  ▼
AWS Fargate (containerized webapp, auto-scaling)
  │
  ▼
PlanetScale (MySQL-compatible, managed database)
```

## Components

**AWS Fargate** — Runs the KeyPears webapp as containers. No servers to manage.
Auto-scales based on load. Each Fargate task runs the same Bun server image.

**Application Load Balancer (ALB)** — Sits in front of Fargate tasks. Handles
HTTPS termination, health checks, and traffic distribution across tasks.

**AWS WAF** — Attached to the ALB. Provides per-IP rate limiting via rate-based
rules. This is the primary defense against DOS attacks and endpoint abuse.
Handles the distributed rate limiting problem (works across all Fargate tasks
without app-level coordination). Rate-based rules can be scoped to specific URL
patterns (e.g., stricter limits on `/api` endpoints).

**PlanetScale** — Managed MySQL-compatible database. Handles replication,
backups, and scaling. The webapp connects via `DATABASE_URL`.

**Terraform** — All infrastructure is defined as code. ALB, Fargate service,
WAF rules, DNS, and secrets are all managed through Terraform configurations
in this directory.

## Rate limiting strategy

Rate limiting is handled at the WAF layer rather than in application code. This
was a deliberate decision: the webapp runs multiple Fargate tasks, and in-memory
rate limiting would scale with the number of instances (doubling tasks doubles
the effective limit). WAF rate-based rules are evaluated globally across all
traffic hitting the ALB, regardless of how many tasks are running behind it.
