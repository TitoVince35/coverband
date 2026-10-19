variable "state_passphrase" {
  description = "Encrypts the state (at least 16 characters). Keep it in a password manager."
  type        = string
  sensitive   = true
}

variable "project_id" {
  description = "Scaleway project holding every resource."
  type        = string
}

variable "organization_id" {
  description = "Scaleway organization of the project (the budget is set on it). For the organization's default project, the same ID as the project."
  type        = string
}

variable "domain" {
  description = "Domain bought at Scaleway Domains & DNS (its DNS zone is managed there), e.g. coverband.fr. Also the email sending domain."
  type        = string
}

variable "app_subdomain" {
  description = "The app is served at https://<app_subdomain>.<domain>."
  type        = string
  default     = "app"
}

variable "mail_from" {
  description = "Sender of the app's emails, an address of the domain. Defaults to noreply@<domain>."
  type        = string
  default     = null
}

variable "admin_email" {
  description = "Default admin, created at the first startup (its password is generated: tofu output -raw admin_password)."
  type        = string
}

variable "budget_eur" {
  description = "Monthly budget in euros; alerts at 50%, 90% and 100%."
  type        = number
  default     = 20
}

variable "alert_email" {
  description = "Receives the budget alerts. Defaults to admin_email."
  type        = string
  default     = null
}
