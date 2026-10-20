resource "random_password" "auth_secret" {
  length = 48
}

resource "random_password" "admin" {
  length = 24
}

resource "scaleway_container_namespace" "main" {
  name        = local.name
  description = "Coverband"
}

# The single container: API plus the built web app. Scales to zero (a cold start of 1 to 3 s after
# a quiet period); set min_scale = 1 to keep one instance running (about €13/month).
resource "scaleway_container" "app" {
  name         = local.name
  namespace_id = scaleway_container_namespace.main.id
  # The deploy workflow sets the image of each release; this one only serves the first creation.
  image                  = "${scaleway_registry_namespace.main.endpoint}/${local.name}:latest"
  port                   = 3000
  cpu_limit              = 560
  memory_limit_bytes     = 1024 * 1000 * 1000 # in MB of 10^6 bytes, as Scaleway counts; at least as many MB as mvCPU
  min_scale              = 0
  max_scale              = 2
  privacy                = "public"
  protocol               = "http1"
  https_connections_only = true

  environment_variables = {
    BETTER_AUTH_URL = local.app_url
    # The bare domain is redirected to the app URL by the app itself (#156).
    REDIRECT_HOSTS = var.domain
    # Scaleway's proxy overwrites X-Real-IP with the caller's IP; X-Forwarded-For keeps what the client sends.
    CLIENT_IP_HEADER = "x-real-ip"
    ADMIN_EMAIL      = var.admin_email
    SMTP_HOST        = scaleway_tem_domain.main.smtp_host
    SMTP_PORT        = "465"
    SMTP_SECURE      = "true"
    SMTP_USER        = scaleway_tem_domain.main.smtps_auth_user
    MAIL_FROM        = local.mail_from
    S3_ENDPOINT      = "https://s3.fr-par.scw.cloud"
    S3_REGION        = "fr-par"
    S3_BUCKET        = scaleway_object_bucket.files.name
  }

  secret_environment_variables = merge({
    DATABASE_URL         = local.database_url
    BETTER_AUTH_SECRET   = random_password.auth_secret.result
    ADMIN_PASSWORD       = random_password.admin.result
    SMTP_PASSWORD        = scaleway_iam_api_key.app.secret_key
    S3_ACCESS_KEY_ID     = scaleway_iam_api_key.app.access_key
    S3_SECRET_ACCESS_KEY = scaleway_iam_api_key.app.secret_key
  }, var.beta_access_code == "" ? {} : { BETA_ACCESS_CODE = var.beta_access_code })

  lifecycle {
    ignore_changes = [image]
  }

  # Emails must be sendable from the first start (invitations).
  depends_on = [scaleway_tem_domain_validation.main, scaleway_iam_policy.app]
}

# https://app.<domain>: a CNAME to the container's endpoint, then the custom domain (Scaleway
# issues its TLS certificate once the CNAME resolves).
resource "scaleway_domain_record" "app" {
  dns_zone = var.domain
  name     = var.app_subdomain
  type     = "CNAME"
  data     = "${trimprefix(scaleway_container.app.public_endpoint, "https://")}."
  ttl      = 3600
}

resource "scaleway_container_domain" "app" {
  container_id = scaleway_container.app.id
  hostname     = local.app_hostname
  depends_on   = [scaleway_domain_record.app]
}

# The bare domain (https://<domain>), redirected to the app by the app itself (REDIRECT_HOSTS):
# Scaleway has no web redirect. A CNAME can't sit at the zone root, but Scaleway's ALIAS can.
resource "scaleway_domain_record" "apex" {
  dns_zone = var.domain
  name     = ""
  type     = "ALIAS"
  data     = "${trimprefix(scaleway_container.app.public_endpoint, "https://")}."
  ttl      = 3600
}

resource "scaleway_container_domain" "apex" {
  container_id = scaleway_container.app.id
  hostname     = var.domain
  depends_on   = [scaleway_domain_record.apex]
}
