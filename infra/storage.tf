# Private bucket for files (avatars...). They are served by the API, never by public bucket URLs.
resource "scaleway_object_bucket" "files" {
  name = "${local.name}-files-${random_id.suffix.hex}"
}
