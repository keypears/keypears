#!/usr/bin/env bash
#
# Build, push, and roll the keypears webapp.
#
# Reads the latest task-definition revision in the family (which Terraform
# manages — that revision carries the current shape: CPU, memory, env
# vars, secrets, IAM, log group), swaps the image to a digest-pinned
# reference of the just-pushed `:latest`, registers the result as a new
# revision, and updates the ECS service to point at it.
#
# Why digest-pinned: ECS deployment circuit-breaker rollback works at the
# task-definition revision level. If a deploy fails health checks, ECS
# rolls back to the previous revision, which still references the
# previous content digest, which still resolves to a real image even
# though the `:latest` tag has moved on. Pinning to a tag literally
# (`...:latest`) defeats this — both old and new revisions would resolve
# to the broken image after rollback.
#
# Usage:
#   ./infra/deploy.sh           # build, push, register, roll
#   ./infra/deploy.sh --no-build # skip build/push; just re-roll the
#                                 # current image with whatever shape
#                                 # Terraform last produced (use after
#                                 # `terraform apply` for a CPU/env
#                                 # change)
#
# Requires: docker, aws CLI, jq.

set -euo pipefail

REGION="us-east-1"
CLUSTER="keypears-prod"
SERVICE="keypears-webapp"
FAMILY="keypears-webapp"
ACCOUNT="299190761597"
REPO_NAME="keypears"
REPO="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/${REPO_NAME}"

NO_BUILD=false
if [[ "${1:-}" == "--no-build" ]]; then
  NO_BUILD=true
fi

# Operate from the repo root so docker can see whitepaper/, packages/, etc.
cd "$(git rev-parse --show-toplevel)"

if ! command -v jq >/dev/null 2>&1; then
  echo "deploy.sh: jq is required (brew install jq)" >&2
  exit 1
fi

if [[ "$NO_BUILD" == "false" ]]; then
  echo "==> copying current whitepaper"
  cp whitepaper/keypears.pdf webapp/public/keypears.pdf

  echo "==> building image (linux/arm64)"
  docker build --platform linux/arm64 -f webapp/Dockerfile -t "${REPO_NAME}:latest" .

  echo "==> logging in to ECR"
  aws ecr get-login-password --region "$REGION" \
    | docker login --username AWS --password-stdin "${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"

  echo "==> pushing :latest"
  docker tag "${REPO_NAME}:latest" "${REPO}:latest"
  docker push "${REPO}:latest"
else
  echo "==> --no-build: reusing existing :latest image"
fi

echo "==> resolving digest of :latest"
DIGEST=$(aws ecr describe-images \
  --repository-name "$REPO_NAME" \
  --image-ids imageTag=latest \
  --region "$REGION" \
  --query 'imageDetails[0].imageDigest' \
  --output text)
echo "    $DIGEST"

echo "==> reading current task definition template (latest revision)"
CURRENT_TASK_DEF=$(aws ecs describe-task-definition \
  --task-definition "$FAMILY" \
  --region "$REGION" \
  --query 'taskDefinition')

# Mutate the template: swap the image to the digest reference and strip
# fields that register-task-definition rejects.
NEW_TASK_DEF=$(echo "$CURRENT_TASK_DEF" | jq \
  --arg img "${REPO}@${DIGEST}" \
  '.containerDefinitions[0].image = $img
   | del(.taskDefinitionArn,
         .revision,
         .status,
         .requiresAttributes,
         .compatibilities,
         .registeredAt,
         .registeredBy)')

echo "==> registering new task definition revision"
NEW_ARN=$(aws ecs register-task-definition \
  --cli-input-json "$NEW_TASK_DEF" \
  --region "$REGION" \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)
echo "    $NEW_ARN"

echo "==> updating service to point at new revision"
aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --task-definition "$NEW_ARN" \
  --region "$REGION" \
  --query 'service.deployments[0].[status,rolloutState,taskDefinition]' \
  --output table

echo "==> waiting for service to reach steady state"
aws ecs wait services-stable \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region "$REGION"

echo "==> deploy complete"
aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region "$REGION" \
  --query 'services[0].[desiredCount,runningCount,deployments[0].rolloutState]' \
  --output table
