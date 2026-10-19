# Serverless SQL Database: billed only while awake, at most 1 vCPU (briefs/claude/007).
# Authentication goes through IAM: the user is an application ID, the password its API key's secret.
resource "scaleway_sdb_sql_database" "main" {
  name    = local.name
  version = "16"
  min_cpu = 0
  max_cpu = 1
}

locals {
  # endpoint: postgres://<host>:5432/<name>?sslmode=require
  database_url        = replace(scaleway_sdb_sql_database.main.endpoint, "postgres://", "postgres://${scaleway_iam_application.app.id}:${scaleway_iam_api_key.app.secret_key}@")
  deploy_database_url = replace(scaleway_sdb_sql_database.main.endpoint, "postgres://", "postgres://${scaleway_iam_application.deploy.id}:${scaleway_iam_api_key.deploy.secret_key}@")
}
