# Container logs (stdout, #42) go to Cockpit's "Scaleway Logs" data source, which Scaleway creates
# with the project and keeps 7 days. Imported to keep them 30 days instead (#44): ingestion is
# free, retention past 7 days costs €0.002 per GB per day, a few cents a year at our volume.
data "scaleway_cockpit_source" "scaleway_logs" {
  origin = "scaleway"
  type   = "logs"
}

import {
  to = scaleway_cockpit_source.logs
  id = data.scaleway_cockpit_source.scaleway_logs.id
}

resource "scaleway_cockpit_source" "logs" {
  name           = "Scaleway Logs"
  type           = "logs"
  retention_days = 30

  # Scaleway's own source: it can't be deleted, only left behind if this file goes.
  lifecycle {
    prevent_destroy = true
  }
}
