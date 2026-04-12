locals {
  name = "keypears"

  # Caller identity — used to build the ECR image URL in the task definition.
  account_id = data.aws_caller_identity.current.account_id

  ecr_image = "${local.account_id}.dkr.ecr.${var.region}.amazonaws.com/${aws_ecr_repository.webapp.name}:${var.image_tag}"
}

data "aws_caller_identity" "current" {}
