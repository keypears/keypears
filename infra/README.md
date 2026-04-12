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

**Terraform** — All infrastructure is defined as code. ALB, Fargate service, WAF
rules, DNS, and secrets are all managed through Terraform configurations in this
directory.

## Rate limiting strategy

Rate limiting is handled at the WAF layer rather than in application code. This
was a deliberate decision: the webapp runs multiple Fargate tasks, and in-memory
rate limiting would scale with the number of instances (doubling tasks doubles
the effective limit). WAF rate-based rules are evaluated globally across all
traffic hitting the ALB, regardless of how many tasks are running behind it.

The current limit is **10000 requests / IP / 5 minutes**, set by
`var.waf_rate_limit` in `terraform/variables.tf`. This is intentionally high
because PoW handles application-level abuse at the points that matter; WAF is a
circuit breaker against pathological clients, not the primary defense.

## Layout

```
infra/
  README.md           this file
  inventory.md        historical snapshot of the pre-Terraform stack (replaced)
  terraform/
    versions.tf       terraform >= 1.9, aws ~> 5.60
    providers.tf      us-east-1, default_tags
    backend.tf        S3 + DynamoDB state backend
    variables.tf      tunable inputs
    locals.tf         name prefix, ECR image URL composition
    network.tf        VPC, public subnets, IGW, route tables
    security.tf       ALB SG + task SG + rules
    edge.tf           ALB, target group, listeners (:80 → :443 redirect)
    acm.tf            certificate + DNS validation records
    dns.tf            apex/www aliases (gated by var.create_cutover_dns)
    waf.tf            regional WAFv2 ACL + ALB association
    ecr.tf            ECR repo `keypears` + lifecycle policy
    logs.tf           CloudWatch log group
    iam.tf            task execution role + task role
    secrets.tf        data source for the existing `keypears-prod` secret
    ecs.tf            cluster, task definition, service
    outputs.tf        ALB DNS, ECR URL, cluster/service names
    terraform.tfvars  per-deploy knobs — gitignored
    terraform.tfvars.example
```

## State backend

Terraform state lives in S3 with DynamoDB locking, both in `us-east-1`:

| Resource            | Name                       |
| ------------------- | -------------------------- |
| S3 bucket           | `keypears-terraform-state` |
| Object key          | `prod/terraform.tfstate`   |
| DynamoDB lock table | `keypears-terraform-locks` |

These were created by hand during bootstrap (see "First-time bootstrap" below)
and are deliberately not managed by Terraform itself, to avoid the
chicken-and-egg problem of storing state for the resources that hold state.

## Prerequisites

Local tools:

- `terraform` ≥ 1.9
- `docker` (Apple Silicon — the image is built for `linux/arm64`)
- `aws` CLI ≥ 2.0
- AWS credentials with admin access to account `299190761597`

Out-of-band setup that Terraform does **not** manage:

- **`keypears-prod` secret in AWS Secrets Manager** — a raw hex string, the
  `DOTENV_PRIVATE_KEY_PROD` value used by dotenvx to decrypt the bundled
  `webapp/.env.prod` at container startup. Terraform reads this via a data
  source; the value lives entirely outside Terraform.
- **`webapp/.env.prod`** — encrypted env file checked into the repo, decrypted
  inside the container at startup using the secret above. Edit with
  `dotenvx encrypt`.
- **Route53 hosted zone for `keypears.com`** — predates the Terraform stack and
  is referenced via `data "aws_route53_zone"`. Don't recreate it.

## Routine deployment (rolling a new container image)

### 1. Build for arm64 from the repo root

```bash
docker build --platform linux/arm64 -f webapp/Dockerfile -t keypears:vN .
```

### 2. Log in to ECR and push

```bash
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin \
    299190761597.dkr.ecr.us-east-1.amazonaws.com
docker tag keypears:vN 299190761597.dkr.ecr.us-east-1.amazonaws.com/keypears:vN
docker push 299190761597.dkr.ecr.us-east-1.amazonaws.com/keypears:vN
```

### 3. Bump the tag in `infra/terraform/terraform.tfvars`

```hcl
image_tag = "vN"
```

### 4. Apply

```bash
cd infra/terraform
terraform apply
```

Terraform creates a new task definition revision pointing at `:vN`. The ECS
service picks it up automatically and rolls forward (deployment circuit
breaker enabled, max 200%, min 100% healthy).

The image tag is pinned in `terraform.tfvars`, never `latest`. Rolling back is
symmetrical: change the tag back to the previous version and re-apply.

## Scaling

Scale by editing `terraform.tfvars` and applying — same as any other infra
change:

```hcl
# infra/terraform/terraform.tfvars
desired_count = 2
```

```bash
cd infra/terraform
terraform apply
```

There is no autoscaling attached to the service, so nothing outside Terraform
should ever touch `desired_count`. If you do attach `aws_appautoscaling_target`
later, you'll need to add `lifecycle { ignore_changes = [desired_count] }` to
`aws_ecs_service.webapp` so Terraform stops fighting the autoscaler on every
plan — and at that point the autoscaler owns scale, not tfvars.

## Emergency DNS rollback

The apex and www Route53 records are gated behind `var.create_cutover_dns`. To
pull `keypears.com` traffic away from the new stack — for instance, to hand the
domain to an external bypass page during an incident — flip the flag and apply:

```hcl
# infra/terraform/terraform.tfvars
create_cutover_dns = false
```

```bash
terraform apply
```

This destroys both alias records, leaving the hosted zone with only NS/SOA.
`keypears.com` will return NXDOMAIN until you point it somewhere else (or flip
the flag back).

## First-time bootstrap

These steps were run once when the stack was created. They're documented here
for disaster recovery only — there's no reason to re-run them in normal
operation.

```bash
# 1. State backend (S3 bucket + DynamoDB lock table)
aws s3api create-bucket --bucket keypears-terraform-state --region us-east-1
aws s3api put-bucket-versioning --bucket keypears-terraform-state \
  --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket keypears-terraform-state \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-public-access-block --bucket keypears-terraform-state \
  --public-access-block-configuration \
  'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'
aws dynamodb create-table --table-name keypears-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --region us-east-1

# 2. Terraform initial apply (with create_cutover_dns = false)
cd infra/terraform
terraform init
terraform apply

# 3. First image build + push
cd ../..
docker build --platform linux/arm64 -f webapp/Dockerfile -t keypears:v1 .
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin \
    299190761597.dkr.ecr.us-east-1.amazonaws.com
docker tag keypears:v1 299190761597.dkr.ecr.us-east-1.amazonaws.com/keypears:v1
docker push 299190761597.dkr.ecr.us-east-1.amazonaws.com/keypears:v1

# 4. Bump terraform.tfvars to image_tag = "v1" and desired_count = 1, then apply
cd infra/terraform
terraform apply
aws ecs wait services-stable --cluster keypears-prod --services keypears-webapp \
  --region us-east-1

# 5. Validate the new ALB directly, then flip cutover DNS
curl -k -H "Host: keypears.com" \
  https://$(terraform output -raw alb_dns_name)/health
# Expect: ok

# 6. Flip create_cutover_dns = true in terraform.tfvars, apply
terraform apply
```

## Observability

| What              | Where                                                              |
| ----------------- | ------------------------------------------------------------------ |
| Container logs    | CloudWatch log group `/ecs/keypears-webapp` (30-day retention)     |
| Container metrics | CloudWatch Container Insights, scoped to cluster `keypears-prod`   |
| ALB metrics       | CloudWatch namespace `AWS/ApplicationELB`                          |
| WAF metrics       | CloudWatch namespace `AWS/WAFV2`, metric name prefix `keypears-*`  |
| Health check      | `https://keypears.com/health` (also wired to the ALB target group) |
