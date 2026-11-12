#!/usr/bin/env bash
# Scaleway's real consumption by product, for the cost diagram (read-only billing API).
#   .claude/skills/infra-diagrams/scaleway-costs.sh 2026-10 2026-11
# Needs a Scaleway key allowed to read billing: SCW_SECRET_KEY in the environment, or infra/.env
# (Vince's admin key, git-ignored). The organization is the project's (infra/terraform.tfvars).
set -euo pipefail
cd "$(dirname "$0")/../../.."

if [ -z "${SCW_SECRET_KEY:-}" ] && [ -f infra/.env ]; then
  set -a; . infra/.env; set +a
fi
: "${SCW_SECRET_KEY:?Set SCW_SECRET_KEY or create infra/.env}"
ORG=$(sed -n 's/^organization_id *= *"\(.*\)"/\1/p' infra/terraform.tfvars 2>/dev/null || true)
ORG=${ORG:-45f9060b-f9fa-4d2d-bc27-e08410a47812}

for period in "${@:-$(date +%Y-%m)}"; do
  echo "== $period"
  curl -sS -H "X-Auth-Token: $SCW_SECRET_KEY" \
    "https://api.scaleway.com/billing/v2beta1/consumptions?organization_id=$ORG&billing_period=$period&page_size=100" |
    python3 -c '
import sys, json
d = json.load(sys.stdin)
if "consumptions" not in d:
    sys.exit(f"Billing API error: {d}")
total = 0
for c in sorted(d["consumptions"], key=lambda c: (c.get("category_name", ""), c.get("product_name", ""))):
    v = c.get("value", {})
    amount = int(v.get("units", 0)) + v.get("nanos", 0) / 1e9
    total += amount
    print("%-18s | %-48s | %9.4f %s | %s %s" % (c.get("category_name", "")[:18], c.get("product_name", "")[:48],
          amount, v.get("currency_code", ""), c.get("billed_quantity", ""), c.get("unit", "")))
print("TOTAL %.2f (before VAT) | updated_at %s" % (total, d.get("updated_at")))
'
done
