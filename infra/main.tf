locals {
  name         = "coverband"
  app_hostname = "${var.app_subdomain}.${var.domain}"
  app_url      = "https://${local.app_hostname}"
  # The admin app (#246): the same container, on its own host.
  admin_hostname = "${var.admin_subdomain}.${var.domain}"
  admin_url      = "https://${local.admin_hostname}"
  mail_from      = coalesce(var.mail_from, "noreply@${var.domain}")
}

# Registry namespaces and bucket names are global: a random suffix avoids collisions.
resource "random_id" "suffix" {
  byte_length = 3
}
