# Two IAM applications, each with only what it needs.

# The running app: data in the database (no schema changes), files in the bucket, emails over SMTP.
resource "scaleway_iam_application" "app" {
  name        = "${local.name}-app"
  description = "Coverband container"
}

resource "scaleway_iam_policy" "app" {
  name           = "${local.name}-app"
  application_id = scaleway_iam_application.app.id
  rule {
    project_ids = [var.project_id]
    permission_set_names = [
      "ServerlessSQLDatabaseDataReadWrite",
      "ObjectStorageObjectsRead",
      "ObjectStorageObjectsWrite",
      "ObjectStorageObjectsDelete",
      "TransactionalEmailEmailSmtpCreate",
    ]
  }
}

resource "scaleway_iam_api_key" "app" {
  application_id     = scaleway_iam_application.app.id
  description        = "Coverband container"
  default_project_id = var.project_id

  # The organization gives keys a 1-year expiry: rotated by hand before it (README.md).
  lifecycle {
    ignore_changes = [expires_at]
  }
}

# GitHub Actions: pushes the image, runs migrations (schema changes), rolls out the container.
resource "scaleway_iam_application" "deploy" {
  name        = "${local.name}-deploy"
  description = "Coverband deploy workflow (GitHub Actions)"
}

resource "scaleway_iam_policy" "deploy" {
  name           = "${local.name}-deploy"
  application_id = scaleway_iam_application.deploy.id
  rule {
    project_ids = [var.project_id]
    permission_set_names = [
      "ContainerRegistryFullAccess",
      "ContainersFullAccess",
      "ServerlessSQLDatabaseReadWrite",
    ]
  }
}

resource "scaleway_iam_api_key" "deploy" {
  application_id     = scaleway_iam_application.deploy.id
  description        = "Coverband deploy workflow (GitHub Actions)"
  default_project_id = var.project_id

  # The organization gives keys a 1-year expiry: rotated by hand before it (README.md).
  lifecycle {
    ignore_changes = [expires_at]
  }
}
