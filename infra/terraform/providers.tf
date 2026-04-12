provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "keypears"
      Environment = "prod"
      ManagedBy   = "terraform"
    }
  }
}
