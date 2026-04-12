locals {
  name = "keypears"

  # Caller identity — used in places where we want the bare account id.
  account_id = data.aws_caller_identity.current.account_id

  # Reference the image by content digest instead of by tag. Each `docker
  # push :latest` produces a new digest; the next `terraform plan` reads
  # the digest via the aws_ecr_image data source below and the task
  # definition gets a new revision pinned to that digest. This is what
  # makes ECS deployment circuit-breaker rollback work properly: a failed
  # deploy rolls back to the previous task definition revision, which
  # still references the previous digest, which still resolves to a real
  # image even though the `:latest` tag has moved on.
  ecr_image = "${aws_ecr_repository.webapp.repository_url}@${data.aws_ecr_image.webapp.image_digest}"
}

data "aws_caller_identity" "current" {}

data "aws_ecr_image" "webapp" {
  repository_name = aws_ecr_repository.webapp.name
  image_tag       = var.image_tag
}
