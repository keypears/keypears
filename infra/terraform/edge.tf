# Application Load Balancer, target group, and HTTP/HTTPS listeners.
# The :80 listener issues a permanent 301 redirect to :443 — a fix vs.
# the previous stack, which forwarded :80 directly.

resource "aws_lb" "main" {
  name               = "${local.name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [for s in aws_subnet.public : s.id]

  enable_deletion_protection = false
  idle_timeout               = 60
  drop_invalid_header_fields = true

  tags = {
    Name = "${local.name}-alb"
  }
}

resource "aws_lb_target_group" "webapp" {
  name        = "${local.name}-tg"
  port        = var.app_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  deregistration_delay = 30

  health_check {
    path                = var.health_check_path
    protocol            = "HTTP"
    port                = "traffic-port"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  tags = {
    Name = "${local.name}-tg"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-Res-2021-06"
  certificate_arn   = aws_acm_certificate_validation.main.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.webapp.arn
  }
}

# Canonicalize www.<domain> to <domain> at the ALB itself. One rule per
# listener so both http://www and https://www land on https://apex in a
# single 301 hop instead of two (http→https→apex). The #{path} and
# #{query} placeholders are ALB redirect-action interpolations — they
# substitute the request's path and query string server-side, so any
# deep link survives the redirect unchanged.

resource "aws_lb_listener_rule" "www_to_apex_https" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  action {
    type = "redirect"
    redirect {
      host        = var.domain
      path        = "/#{path}"
      query       = "#{query}"
      protocol    = "HTTPS"
      port        = "443"
      status_code = "HTTP_301"
    }
  }

  condition {
    host_header {
      values = ["www.${var.domain}"]
    }
  }
}

resource "aws_lb_listener_rule" "www_to_apex_http" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10

  action {
    type = "redirect"
    redirect {
      host        = var.domain
      path        = "/#{path}"
      query       = "#{query}"
      protocol    = "HTTPS"
      port        = "443"
      status_code = "HTTP_301"
    }
  }

  condition {
    host_header {
      values = ["www.${var.domain}"]
    }
  }
}
