# Fresh ECR repository for the new stack. Named `keypears` (not
# `keypears-webapp`) to avoid colliding with the old stack's repo,
# which will be torn down after cutover.

resource "aws_ecr_repository" "webapp" {
  name                 = "keypears"
  image_tag_mutability = "MUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name = "keypears"
  }
}

# Keep image history bounded so pushes don't accumulate indefinitely.
resource "aws_ecr_lifecycle_policy" "webapp" {
  repository = aws_ecr_repository.webapp.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep the most recent 10 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
