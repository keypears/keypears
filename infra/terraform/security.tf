# Two security groups: one for the ALB (public 80/443), one for the
# Fargate tasks (only accepts traffic from the ALB on the app port).
# Egress is open — the tasks need to reach PlanetScale, ECR, Secrets
# Manager, and federated KeyPears servers over the internet.

resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Allow inbound HTTP/HTTPS from the internet to the ALB."
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${local.name}-alb"
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
  description       = "HTTP (redirects to HTTPS)"
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  description       = "HTTPS"
}

resource "aws_vpc_security_group_egress_rule" "alb_all" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
  description       = "All egress"
}

resource "aws_security_group" "task" {
  name        = "${local.name}-task"
  description = "Allow traffic from the ALB to the webapp container, and outbound to anywhere."
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${local.name}-task"
  }
}

resource "aws_vpc_security_group_ingress_rule" "task_from_alb" {
  security_group_id            = aws_security_group.task.id
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = var.app_port
  to_port                      = var.app_port
  ip_protocol                  = "tcp"
  description                  = "Webapp port from ALB"
}

resource "aws_vpc_security_group_egress_rule" "task_all" {
  security_group_id = aws_security_group.task.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
  description       = "All egress (PlanetScale, ECR, Secrets Manager, federation)"
}
