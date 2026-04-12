variable "region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-east-1"
}

variable "domain" {
  description = "Primary address domain. Also used as the API domain and ACM cert subject."
  type        = string
  default     = "keypears.com"
}

variable "app_port" {
  description = "Port the container listens on. Must match PORT env in the task definition and the health-check target."
  type        = number
  default     = 4273
}

variable "health_check_path" {
  description = "Path the ALB target group hits to check health."
  type        = string
  default     = "/health"
}

variable "image_tag" {
  description = "ECR image tag whose digest the task definition pins to. Defaults to `latest`. Routine deploys overwrite this tag in ECR; the digest changes; the next `terraform apply` reads the new digest via the aws_ecr_image data source and rolls a new task definition revision."
  type        = string
  default     = "latest"
}

variable "desired_count" {
  description = "Number of Fargate tasks for the webapp service. Start at 0 until the image has been pushed, then bump to 1."
  type        = number
  default     = 0
}

variable "task_cpu" {
  description = "Fargate task CPU units. 512 = 0.5 vCPU."
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "Fargate task memory in MiB. Must form a legal pair with task_cpu."
  type        = number
  default     = 1024
}

variable "log_retention_days" {
  description = "CloudWatch log retention for the webapp log group."
  type        = number
  default     = 30
}

variable "waf_rate_limit" {
  description = "WAF rate-based rule limit (requests per IP per 5-minute window). High by design — PoW handles application-level abuse."
  type        = number
  default     = 10000
}

variable "vpc_cidr" {
  description = "CIDR block for the KeyPears VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for the two public subnets, one per AZ."
  type        = list(string)
  default     = ["10.0.0.0/20", "10.0.16.0/20"]
}

variable "availability_zones" {
  description = "Availability zones for the public subnets. Must have the same length as public_subnet_cidrs."
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "create_cutover_dns" {
  description = "When true, create the apex (keypears.com) and www Route53 alias records pointing at the new ALB. Leave false until the new stack is built, validated, and carrying a healthy task — then flip to true to cut traffic over."
  type        = bool
  default     = false
}
