# Catches a database left awake or a runaway container long before the bill (briefs/claude/007).
resource "scaleway_billing_budget" "main" {
  consumption_limit = var.budget_eur
  enabled           = true
}

resource "scaleway_billing_budget_alert" "main" {
  for_each  = toset(["50", "90", "100"])
  budget_id = scaleway_billing_budget.main.id
  threshold = tonumber(each.key)
}

resource "scaleway_billing_budget_alert_notification" "main" {
  for_each        = scaleway_billing_budget_alert.main
  budget_alert_id = each.value.id
  email_addresses = [coalesce(var.alert_email, var.admin_email)]
}
