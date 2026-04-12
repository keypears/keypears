# Two roles:
#
# 1. task_execution — used by Fargate itself to pull the image from ECR,
#    write logs to CloudWatch, and read the secret that gets injected
#    into the container as DOTENV_PRIVATE_KEY_PROD. This is the role
#    assumed BEFORE the container starts.
#
# 2. task — the role the container runs under. The webapp does not
#    currently call any AWS APIs, so this role is empty. Keeping it
#    separate from the execution role keeps the least-privilege story
#    clean and makes it easy to grant app-level AWS access later.

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task_execution" {
  name               = "${local.name}-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json

  tags = {
    Name = "${local.name}-task-execution"
  }
}

resource "aws_iam_role_policy_attachment" "task_execution_managed" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Inline policy granting access to the single Secrets Manager secret
# that the task definition references. Scoped to this secret's ARN
# only, not a wildcard.
data "aws_iam_policy_document" "task_execution_secrets" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [data.aws_secretsmanager_secret.dotenv_key.arn]
  }
}

resource "aws_iam_role_policy" "task_execution_secrets" {
  name   = "secrets-read"
  role   = aws_iam_role.task_execution.id
  policy = data.aws_iam_policy_document.task_execution_secrets.json
}

resource "aws_iam_role" "task" {
  name               = "${local.name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json

  tags = {
    Name = "${local.name}-task"
  }
}
