# Route53 records pointing the apex and www at the new ALB.
#
# Gated on var.create_cutover_dns. Leave false until the new stack is
# fully up (service healthy, /health returning 200 on the new ALB DNS
# name directly) — flipping to true OVERWRITES the existing apex/www
# records that currently point at the OLD stack's ALB, cutting all
# keypears.com traffic over to the new stack in one apply.

data "aws_route53_zone" "main" {
  name         = "${var.domain}."
  private_zone = false
}

resource "aws_route53_record" "apex" {
  count = var.create_cutover_dns ? 1 : 0

  zone_id         = data.aws_route53_zone.main.zone_id
  name            = var.domain
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "www" {
  count = var.create_cutover_dns ? 1 : 0

  zone_id         = data.aws_route53_zone.main.zone_id
  name            = "www.${var.domain}"
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}
