# Jobs the stateless server can't schedule itself: Scaleway calls the container's /api/internal
# routes with a shared secret (CRON_SECRET in container.tf). The container wakes up for them.

resource "random_password" "cron_secret" {
  length  = 48
  special = false
}

# Activity rows are kept one year (#45). Once a day, at night.
resource "scaleway_container_trigger" "purge_activity" {
  container_id = scaleway_container.app.id
  name         = "purge-activity"
  description  = "Deletes activity rows older than one year"

  cron {
    schedule = "17 4 * * *"
    timezone = "Europe/Paris"
    # JSON: without a content type, the app's CSRF guard would take it for a form post.
    body = "{}"
    headers = {
      "Content-Type"  = "application/json"
      "Authorization" = "Bearer ${random_password.cron_secret.result}"
    }
  }

  destination_config {
    http_method = "post"
    http_path   = "/api/internal/purge-activity"
  }
}
