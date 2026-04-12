# Existing AWS Infrastructure Inventory

Snapshot of the existing `keypears.com` production deployment in AWS account
`299190761597`, region `us-east-1`. Captured before writing Terraform, so we
have a written record of what to replace and what to tear down.

**Status:** live, 1 Fargate task running, 0 users, out of date. Will be
replaced by a Terraform-managed stack, then torn down.

## Compute — ECS / Fargate

| Resource             | Name / ID                                          |
| -------------------- | -------------------------------------------------- |
| ECS cluster          | `keypears-cluster`                                 |
| ECS service          | `keypears-webapp-task-service-2hw3gtif`            |
| Task definition      | `keypears-webapp-task:3` (FARGATE, platform 1.4.0) |
| Desired / running    | 1 / 1                                              |
| Networking           | awsvpc, public subnets, `assignPublicIp: ENABLED`  |
| Container log group  | `/ecs/keypears-webapp` (~347 MB, no retention)     |

## Load balancer

| Resource              | Name / ID                                                 |
| --------------------- | --------------------------------------------------------- |
| ALB                   | `keypears-alb` (internet-facing, active)                  |
| DNS                   | `keypears-alb-1699517653.us-east-1.elb.amazonaws.com`     |
| Listener `:80 HTTP`   | forward → `keypears-tg` (no HTTPS redirect)               |
| Listener `:443 HTTPS` | forward → `keypears-tg`, TLS13-1-2-Res-2021-06            |
| ACM cert on `:443`    | `d5639193-3bbb-4154-84fb-dc16cc62b40b` (keypears.com, ISSUED) |
| Target group          | `keypears-tg` (HTTP, port **4273**, target-type `ip`)     |

## Networking

| Resource           | Name / ID                                                 |
| ------------------ | --------------------------------------------------------- |
| VPC                | `vpc-01351104fbb4579e2` (`keypears-vpc`, `10.0.0.0/16`)   |
| Subnet 1           | `subnet-036620c512359ec30` `keypears-subnet-public1-us-east-1a` (10.0.0.0/20) |
| Subnet 2           | `subnet-0292ca311191d27b8` `keypears-subnet-public2-us-east-1b` (10.0.16.0/20) |
| Internet gateway   | `igw-0433dd09331ca2a51` (`keypears-igw`)                  |
| SG (ALB)           | `sg-008f7effaa09e9b65` `keypears-alg-sg`                  |
| SG (tasks)         | `sg-03f20279db7a6d647` `keypears-webapp-sg`               |

Both subnets are tagged public but have `MapPublicIpOnLaunch: False`. The
service overrides with `assignPublicIp: ENABLED`, so Fargate tasks reach the
internet via their own public IPs through the IGW. There are no private
subnets and no NAT gateway.

## Container image

| Resource | Name                                                             |
| -------- | ---------------------------------------------------------------- |
| ECR repo | `keypears-webapp` (`299190761597.dkr.ecr.us-east-1.amazonaws.com/keypears-webapp`) |

## Secrets

| Resource        | Name                                  |
| --------------- | ------------------------------------- |
| Secrets Manager | `keypears-com` (suffix `pYqeBw`)      |

## DNS — Route53 hosted zone `keypears.com`

Zone ID: `Z07778511K7VM0BCN7CYN`

| Record                                              | Type        | Target                                               |
| --------------------------------------------------- | ----------- | ---------------------------------------------------- |
| `keypears.com`                                      | A (alias)   | `dualstack.keypears-alb-1699517653...`               |
| `www.keypears.com`                                  | A (alias)   | `dualstack.keypears-alb-1699517653...`               |
| `_3389d91c...keypears.com`                          | CNAME       | ACM DNS validation                                   |
| `_fdda9890...www.keypears.com`                      | CNAME       | ACM DNS validation                                   |
| (plus the usual NS / SOA)                           |             |                                                      |

## IAM

- `ecsTaskExecutionRole` — standard AWS pattern, likely shared across projects; **do not delete** during teardown.
- `AWSServiceRoleForECS`, `AWSServiceRoleForApplicationAutoScaling_ECSService` — service-linked roles, leave alone.
- No dedicated `keypears-*` IAM roles exist.

## Gaps vs. target architecture (infra/README.md)

1. **No WAF.** `wafv2 list-web-acls` is empty for both REGIONAL and CLOUDFRONT scopes. The README names WAF as the primary rate-limiting layer; the current deployment has none. The new stack must add a WAFv2 regional web ACL associated with the ALB.
2. **No HTTP→HTTPS redirect.** The `:80` listener forwards to the target group instead of issuing a 301/308. The new stack should redirect `:80 → :443`.
3. **No CloudWatch log retention.** `/ecs/keypears-webapp` has `retentionInDays: None` (never expires) — already 347 MB with 0 users. New stack should set a retention policy (e.g. 30 days).
4. **Fargate tasks run in public subnets with public IPs.** Works, but not best practice. For a stateless app that talks to PlanetScale over the internet anyway, "public subnets with tight SGs" is defensible, but this is a conscious decision to make for the new stack.
5. **`powvalidator.com`** — unrelated resources exist in the same account (ECR repo `powvalidator-com`, Secrets Manager entry `powvalidator-com`, expired ACM cert). **Do not touch** during the KeyPears teardown.

## Teardown targets (for reference; no action taken)

Everything prefixed `keypears-*`, specifically:

- ECS service → cluster → task definition revisions
- ALB + listeners + target group + ALB security group
- Task security group
- VPC → subnets → IGW (after ENIs are released by Fargate)
- ECR repo `keypears-webapp` (`--force` needed if images remain)
- Secret `keypears-com`
- ACM cert `d5639193-3bbb-4154-84fb-dc16cc62b40b`
- CloudWatch log group `/ecs/keypears-webapp`
- Route53: the two A aliases (`keypears.com`, `www.keypears.com`) and the two ACM validation CNAMEs

**Keep:** the Route53 hosted zone itself — the registrar NS delegation already
points here; Terraform will reference it via `data "aws_route53_zone"`.
