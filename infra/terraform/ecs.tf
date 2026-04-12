# ECS cluster, task definition, and service for the webapp.
#
# Running on Fargate with arm64 (cpuArchitecture = ARM64). This matches
# the local dev machine, so images built via `docker build` on Apple
# Silicon push straight to ECR without cross-arch emulation. Arm Fargate
# is also ~20% cheaper than x86_64 Fargate.

resource "aws_ecs_cluster" "main" {
  name = "${local.name}-prod"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "${local.name}-prod"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}

resource "aws_ecs_task_definition" "webapp" {
  family                   = "${local.name}-webapp"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([
    {
      name      = "webapp"
      image     = local.ecr_image
      essential = true

      portMappings = [
        {
          containerPort = var.app_port
          hostPort      = var.app_port
          protocol      = "tcp"
          appProtocol   = "http"
          name          = "webapp-${var.app_port}-tcp"
        }
      ]

      environment = [
        { name = "PORT", value = tostring(var.app_port) },
        { name = "NODE_ENV", value = "production" },
        { name = "KEYPEARS_DOMAIN", value = var.domain },
        { name = "KEYPEARS_API_DOMAIN", value = var.domain },
      ]

      secrets = [
        {
          name      = "DOTENV_PRIVATE_KEY_PROD"
          valueFrom = data.aws_secretsmanager_secret.dotenv_key.arn
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.webapp.name
          awslogs-region        = var.region
          awslogs-stream-prefix = "webapp"
        }
      }
    }
  ])

  tags = {
    Name = "${local.name}-webapp"
  }
}

resource "aws_ecs_service" "webapp" {
  name            = "${local.name}-webapp"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.webapp.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = [for s in aws_subnet.public : s.id]
    security_groups  = [aws_security_group.task.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.webapp.arn
    container_name   = "webapp"
    container_port   = var.app_port
  }

  # Avoid fighting deploy workflows that update the image via
  # `aws ecs update-service --force-new-deployment`: Terraform should
  # own the shape of the service, not its running task count.
  lifecycle {
    ignore_changes = [desired_count]
  }

  depends_on = [
    aws_lb_listener.https,
    aws_iam_role_policy.task_execution_secrets,
  ]

  tags = {
    Name = "${local.name}-webapp"
  }
}
