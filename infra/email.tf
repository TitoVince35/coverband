# Transactional Email. The domain's zone is at Scaleway, so autoconfig writes the SPF, DKIM, MX
# and DMARC records itself; the validation waits until TEM has checked them.
resource "scaleway_tem_domain" "main" {
  name       = var.domain
  accept_tos = true
  autoconfig = true
}

resource "scaleway_tem_domain_validation" "main" {
  domain_id = scaleway_tem_domain.main.id
  timeout   = 600
}
