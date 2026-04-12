# The `keypears-prod` secret was created manually outside of Terraform
# and holds the raw-hex DOTENV_PRIVATE_KEY_PROD value that decrypts
# webapp/.env.prod at runtime. Terraform only reads its ARN — it never
# touches the value.

data "aws_secretsmanager_secret" "dotenv_key" {
  name = "keypears-prod"
}
