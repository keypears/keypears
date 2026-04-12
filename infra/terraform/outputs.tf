output "alb_dns_name" {
  description = "Public DNS name of the KeyPears ALB. Use this to validate the stack before flipping keypears.com at it."
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Hosted zone ID of the ALB (used by Route53 alias records)."
  value       = aws_lb.main.zone_id
}

output "ecr_repository_url" {
  description = "ECR repository to push the webapp image to."
  value       = aws_ecr_repository.webapp.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name (for `aws ecs update-service` commands)."
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name (for `aws ecs update-service` commands)."
  value       = aws_ecs_service.webapp.name
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group for the webapp container."
  value       = aws_cloudwatch_log_group.webapp.name
}

output "task_execution_role_arn" {
  description = "ECS task execution role ARN."
  value       = aws_iam_role.task_execution.arn
}

output "dotenv_secret_arn" {
  description = "ARN of the Secrets Manager secret injected into the container as DOTENV_PRIVATE_KEY_PROD."
  value       = data.aws_secretsmanager_secret.dotenv_key.arn
}
