output "app_url" {
  value = local.app_url
}

output "container_endpoint" {
  description = "Scaleway's own URL of the container (works before the custom domain does)."
  value       = scaleway_container.app.public_endpoint
}

output "api_keys_expire_at" {
  description = "The API keys stop working on this date: rotate them before (README.md). Both are created and rotated together."
  value       = scaleway_iam_api_key.app.expires_at
}

output "admin_password" {
  description = "Password of the default admin (change it after the first login)."
  value       = random_password.admin.result
  sensitive   = true
}

# Read by github-secrets.sh to configure the deploy workflow.
output "container_id" {
  description = "Without the region prefix (the provider's id is fr-par/<uuid>), as the Containers API expects."
  value       = element(split("/", scaleway_container.app.id), 1)
}

output "registry_image" {
  value = "${scaleway_registry_namespace.main.endpoint}/${local.name}"
}

output "deploy_secret_key" {
  value     = scaleway_iam_api_key.deploy.secret_key
  sensitive = true
}

output "deploy_database_url" {
  value     = local.deploy_database_url
  sensitive = true
}

output "cron_secret" {
  description = "Secret of the app's cron job routes (/api/internal), to run a job by hand."
  value       = random_password.cron_secret.result
  sensitive   = true
}
