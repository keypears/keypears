terraform {
  backend "s3" {
    bucket         = "keypears-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "keypears-terraform-locks"
    encrypt        = true
  }
}
