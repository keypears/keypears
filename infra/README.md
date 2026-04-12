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

```bash
./infra/deploy.sh
```

That's the whole thing. Run from the repo root. Terraform is not in the
loop.

The script (see `infra/deploy.sh`):

1. Builds the image for `linux/arm64`
2. Logs in to ECR and pushes `:latest` (overwriting the tag)
3. Reads the digest of the just-pushed `:latest` from ECR
4. Reads the latest task-definition revision in the family — that's the
   *template* that Terraform manages, carrying the current shape (CPU,
   memory, env vars, secrets, IAM, log group)
5. Mutates the template's `containerDefinitions[0].image` to the digest
   reference (`...keypears@sha256:...`), strips the read-only fields, and
   `aws ecs register-task-definition`s it as a new revision
6. `aws ecs update-service` points the service at the new revision
7. `aws ecs wait services-stable` blocks until the rollout finishes

Each new revision is pinned to a unique content digest, so the ECS
deployment circuit breaker has a real previous revision to roll back to
on failure: the previous revision references the previous digest, which
still resolves to a real image even though the `:latest` tag has moved
on.

### Re-rolling without a rebuild

After a Terraform-managed *shape* change (CPU, memory, env vars, IAM),
Terraform creates a new task-definition revision with the new shape,
but the service doesn't follow it on its own — `aws_ecs_service.webapp`
has `lifecycle { ignore_changes = [task_definition] }` so the deploy
script remains the only thing that updates which revision is live. To
propagate the shape change without rebuilding the image:

```bash
./infra/deploy.sh --no-build
```

That skips the build/push and goes straight to step 3 above, picking up
whatever Terraform-produced revision is now latest in the family.

### Manual rollback

If you need to roll back to a known-good earlier image, retag `:latest`
in ECR to point at the previous digest, then re-roll with `--no-build`.
The script will pick up the now-restored `:latest` digest and register a
new revision pointing at the older image.

List what's still in ECR, newest first:

```bash
aws ecr describe-images --repository-name keypears --region us-east-1 \
  --query 'reverse(sort_by(imageDetails,&imagePushedAt))[].[imageDigest,imagePushedAt]' \
  --output table
```

Retag in place (no rebuild) and re-roll:

```bash
DIGEST=sha256:abc123…   # the digest you want to roll back to
MANIFEST=$(aws ecr batch-get-image --repository-name keypears \
  --image-ids imageDigest=$DIGEST --region us-east-1 \
  --query 'images[0].imageManifest' --output text)
aws ecr put-image --repository-name keypears --image-tag latest \
  --image-manifest "$MANIFEST" --region us-east-1
./infra/deploy.sh --no-build
```

Check what digest is currently live:

```bash
aws ecs describe-task-definition --task-definition keypears-webapp \
  --region us-east-1 --query 'taskDefinition.[revision,containerDefinitions[0].image]' \
  --output text
```

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

# 2. Phase-1 Terraform: create just the ECR repo
cd infra/terraform
terraform init
terraform apply -target=aws_ecr_repository.webapp

# 3. First image build + push (must exist before phase-2 apply, because
# the task-definition template references `:latest`)
cd ../..
docker build --platform linux/arm64 -f webapp/Dockerfile -t keypears:latest .
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin \
    299190761597.dkr.ecr.us-east-1.amazonaws.com
docker tag keypears:latest 299190761597.dkr.ecr.us-east-1.amazonaws.com/keypears:latest
docker push 299190761597.dkr.ecr.us-east-1.amazonaws.com/keypears:latest

# 4. Phase-2 Terraform: full apply (with create_cutover_dns = false)
cd infra/terraform
terraform apply

# 5. First real deploy via the deploy script — registers a digest-pinned
# task definition revision and rolls the service onto it
cd ..
./deploy.sh --no-build

# 6. Validate the new ALB directly, then flip cutover DNS
cd terraform
curl -k -H "Host: keypears.com" \
  https://$(terraform output -raw alb_dns_name)/health
# Expect: ok

# 7. Flip create_cutover_dns = true in terraform.tfvars, apply
terraform apply

# 8. Sign up as the address you want to use as admin on keypears.com.
# This can be a local address (ryan@keypears.com) or a federated one
# (ryan@ryanxcharles.com). Whichever you pick, create the account via
# the public signup flow at https://keypears.com.

# 9. Set KEYPEARS_ADMIN in webapp/.env.prod to that address, then
# redeploy. The /.well-known/keypears.json response will include an
# `admin` field pointing at your address, which lets you claim
# keypears.com as the verified admin.
cd ../..
dotenvx set KEYPEARS_ADMIN ryan@ryanxcharles.com -f webapp/.env.prod
./infra/deploy.sh

# 10. Log in as the admin address at https://keypears.com, visit
# /domains, click Claim on keypears.com. You're now the verified admin
# and can manage users, reset passwords, and toggle open registration.
```

See [Claiming your primary domain](../webapp/src/docs/self-hosting.md#claiming-your-primary-domain)
in the self-hosting guide for the full context and why this is opt-in.

## Observability

| What              | Where                                                              |
| ----------------- | ------------------------------------------------------------------ |
| Container logs    | CloudWatch log group `/ecs/keypears-webapp` (30-day retention)     |
| Container metrics | CloudWatch Container Insights, scoped to cluster `keypears-prod`   |
| ALB metrics       | CloudWatch namespace `AWS/ApplicationELB`                          |
| WAF metrics       | CloudWatch namespace `AWS/WAFV2`, metric name prefix `keypears-*`  |
| Health check      | `https://keypears.com/health` (also wired to the ALB target group) |
