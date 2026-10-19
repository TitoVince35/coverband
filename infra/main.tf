locals {
  name         = "coverband"
  app_hostname = "${var.app_subdomain}.${var.domain}"
  app_url      = "https://${local.app_hostname}"
  mail_from    = coalesce(var.mail_from, "noreply@${var.domain}")
}

# Registry namespaces and bucket names are global: a random suffix avoids collisions.
resource "random_id" "suffix" {
  byte_length = 3
}
