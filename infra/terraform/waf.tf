# Regional WAFv2 web ACL attached to the ALB. A single rate-based rule
# blocks any IP exceeding var.waf_rate_limit requests in a 5-minute
# window. Limit is intentionally high (default 10000/5min/IP) because
# PoW handles application-level abuse at the points that matter;
# WAF here is a circuit breaker against pathological clients, not a
# primary defense.

resource "aws_wafv2_web_acl" "main" {
  name        = "${local.name}-acl"
  description = "Rate limiting for the KeyPears ALB."
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "rate-limit-per-ip"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit                 = var.waf_rate_limit
        aggregate_key_type    = "IP"
        evaluation_window_sec = 300
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name}-acl"
    sampled_requests_enabled   = true
  }

  tags = {
    Name = "${local.name}-acl"
  }
}

resource "aws_wafv2_web_acl_association" "main" {
  resource_arn = aws_lb.main.arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}
