# Private registry for the app's image. The deploy workflow pushes <sha> and latest tags.
resource "scaleway_registry_namespace" "main" {
  name        = "${local.name}-${random_id.suffix.hex}"
  description = "Coverband images"
  is_public   = false
}
