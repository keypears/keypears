locals {
  name = "keypears"

  # Caller identity — used in places where we want the bare account id.
  account_id = data.aws_caller_identity.current.account_id

  # The task definition Terraform manages is a *template*: it carries the
  # shape (CPU, memory, env vars, secrets, IAM, log group) and points at
  # the `:latest` tag as a placeholder. The ECS service has
  # `ignore_changes = [task_definition]`, so the service does not actually
  # follow this template on its own — `infra/deploy.sh` reads the latest
  # revision in this family, swaps the image to a digest-pinned reference,
  # registers a new revision, and updates the service to point at it.
  # That keeps Terraform out of the routine deploy loop while still
  # owning the source of truth for task shape.
  ecr_image = "${aws_ecr_repository.webapp.repository_url}:${var.image_tag}"
}

data "aws_caller_identity" "current" {}
