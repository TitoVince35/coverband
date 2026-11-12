---
name: infra-diagrams
description: Regenerate and republish CoverBand's two infrastructure pages, the architecture diagram (brief 032) and the running costs (brief 033), as claude.ai artifacts, each versioned and dated. Use when asked to update, refresh or re-run the architecture or cost diagram, after an infrastructure change (infra/, deploy workflow, a new outside service), or for a new month's costs.
---

# Architecture and cost diagrams

Two pages, kept in the repository and published to fixed artifact URLs:

| Page | Source | Artifact (update it, never a new one) | Brief |
| --- | --- | --- | --- |
| Architecture | `doc/diagrams/architecture.html` | https://claude.ai/artifact/PxD1bMuYLdTpSo2CTipAR7 | `doc/briefs/vince/032_archi-diagram.md` |
| Running costs | `doc/diagrams/costs.html` | https://claude.ai/artifact/CYttxpfv4ni2rjqydDb8pm | `doc/briefs/vince/033_cost-diagram.md` |

The cost page is the architecture page with the same boxes and arrows, each box's text replaced by its cost: **a box added to one is added to the other.** Except what costs the app nothing by nature, left out of the cost page (diagram, table and notes; Vince's decision, v1.1): the Development group (Vince's laptop, Claude) and the band members' phones.

## Versions

Each page shows `vX.Y · <Weekday YYYY/MM/DD>` at the start of its top line (the `eyebrow`), the date the version is published.
- **Minor** (v1.0 → v1.1): updated figures or facts (a new month's bills, a changed size, a new service box).
- **Major** (v1.x → v2.0): a new layout or a new kind of content, when Vince asks for one.
- Every published version gets a line in its brief's `## Versions` section: `- **v1.1**, Weekday YYYY/MM/DD: what changed.`, newest last. Publish with the Artifact tool's `label` set to the version.

## 1. Gather the facts

Always from the source, never from memory or the previous page:
- **Scaleway resources and sizes:** `infra/*.tf`, for example the container's `cpu_limit`, `memory_limit_bytes` and scales, the database's `min_cpu`/`max_cpu`, the cron schedule, log retention, the budget (`infra/terraform.tfvars`, git-ignored: `budget_eur`, the domain and hostnames).
- **The deploy path:** `.github/workflows/deploy.yml` (build and push, migrate, roll out, check, tag) and `ci.yml`.
- **Services the API calls:** `apps/api/src/env.ts` and `apps/api/src/adapters/` (mail, storage, push, lyrics, Deezer, YouTube).
- **GitHub:** `gh repo view --json visibility,diskUsage`; CI volume over 30 days with `gh run list --limit 1000 --created ">=<date>" --json workflowName,createdAt,updatedAt,status`. A public repository's Actions are free; a private one gets 2,000 minutes a month on the Free plan.
- **Real costs:** `.claude/skills/infra-diagrams/scaleway-costs.sh <YYYY-MM>...` prints the consumption by product, from Scaleway's billing API (read-only). It uses `infra/.env` (Vince's admin key; if it's gone, ask Vince for a key that can read billing). Amounts are before VAT (20%).
- **Prices and free tiers:** Scaleway's pricing pages, last summarized in `doc/briefs/claude/007_scaleway-products.md`. Check them again when a figure depends on a price, and say on the page when a price couldn't be confirmed.
- **Claude:** not on the cost page (above).

## 2. Compute the costs (cost page)

- **The current month, projected to 30 days:** each usage line × 30 / days elapsed (the API's `updated_at` gives the cut). Then subtract the free tiers once per month: the containers' 200,000 vCPU-seconds and 400,000 GB-seconds (−€2.00 and −€0.80), 300 emails, 75 GB of Object Storage downloads.
- **Yearly** = monthly × 12 + the domain (billed once a year).
- **With VAT** = × 1.2.
- **The share of each service**, for the bar in the totals card.
- **"Billed so far"** lists each month's real total.
- **Compare with the budget alert** (`budget_eur`): say it plainly when the projection goes over.

## 3. Edit the page

- Edit the HTML in `doc/diagrams/` directly: small changes with the Artifact tool's `edits` on a publish of that file, larger ones with Edit, then publish the same file. Keep the design tokens, the light and dark themes and the `role="img"` and `aria-label` of each diagram (update the label when the facts change).
- **Diagram rules** (inline SVG): every arrow labelled; nothing overlaps. Before publishing, check the boxes' text fits and the arrows' labels sit clear of other lines.
- Bump the version and the date in the eyebrow (above).

## 4. Publish and record

1. Publish the file with the Artifact tool. Pass `url` with the page's artifact URL when the file wasn't published in this conversation (read the artifact first, as the tool asks), and `label: "vX.Y"`. Never create a new artifact unless Vince asks.
2. Add the version's line to the brief's `## Versions` section.
3. Leave `doc/diagrams/` and the brief uncommitted for Vince's review, as usual.
4. Tell Vince the link, the version, what changed, and for the cost page the monthly and yearly totals before and with VAT, and whether the budget alert is likely to go off.
