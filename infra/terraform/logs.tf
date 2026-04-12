resource "aws_cloudwatch_log_group" "webapp" {
  name              = "/ecs/keypears-webapp"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "/ecs/keypears-webapp"
  }
}
