# 007 - Scaleway products and cost estimate

> 🕒 Study posted on Friday 2026/10/16 18:33

The Scaleway products CoverBand needs before the first deployment, what each one is for, and what it should cost.

## Nothing to buy up front, except a domain

Scaleway is pay-as-you-go: create an account, verify your identity, add a payment method. Each product is then billed for what it uses, and the free tiers apply automatically. The only thing you buy ahead is the domain name, billed yearly.

**Estimate at the early size (a few bands, tens of users): about €2–12 per month, plus a domain at about €6–12 per year, before 20% VAT.** The database is most of the cost.

## Products

| Product | Usage in CoverBand | Pricing (Paris, before VAT) | Estimate |
|---|---|---|---|
| **Serverless Containers** | Runs the single container: API plus the built web app. A cron trigger can later run the activity purge (#45). | Each month, 200,000 vCPU-seconds and 400,000 GB-seconds of memory are free. After that, €1.00 per 100,000 vCPU-seconds and €0.20 per 100,000 GB-seconds. | **≈ €0** if it scales to zero (0.5 vCPU, 512 MB, about 4 hours active per day). **≈ €13/month** if one instance always runs, to avoid cold starts. |
| **Serverless SQL Database** (PostgreSQL) | Database, sessions, rate limits, activity table. | Compute €0.1375 per vCPU-hour, only while active, with at least 5 minutes per wake-up. Storage €0.20 per GB per month. 7 days of daily backups included. | **≈ €1–10/month**, depending on how many hours a day it is awake. Storage is under €0.20. |
| **Transactional Email (TEM)**, Essential plan | Invitations and password reset emails. | 300 emails per month free, then €0.25 per 1,000. | **€0** |
| **Domain name** (Scaleway Domains & DNS, or any registrar) | App URL, and the sender domain TEM requires (SPF/DKIM records). | .fr €5.98 per year (price shown before AFNIC's increase), .com €12.34 per year. One DNS zone included. | **≈ €6–12/year**. €0 if you already own a domain. |
| **Container Registry** | Stores the Docker image the container runs. | Private images €0.027 per GB per month. Public images free up to 75 GB. Pulls within the Paris region free. | **≈ €0.03/month**, or €0 if public |
| **Object Storage** (Standard, Multi-AZ) | Sheet music and media later. Not needed for the first deployment. | €0.016 per GB per month. 75 GB of downloads free each month. Requests free. | **< €0.10/month** for the first few GB |
| **Cockpit** | Logs and metrics (#42, #44). Containers send their logs there automatically. | Logs from Scaleway products: free to ingest, 7 days of retention included, then €0.002 per GB per day. | **≈ €0.06/year** with 30-day retention |

## Not needed

- **Secret Manager:** Serverless Containers have built-in secret environment variables for free.
- **Serverless Jobs:** the purge can use a container cron trigger instead.
- **Managed Database instances:** we use the serverless one.
- **TEM Scale plan** (€80/month): only worth it above about 100,000 emails a month.

## What really drives the cost

1. **How long the database stays awake.** Every query keeps it active for at least 5 minutes, so anything that polls it regularly (a monitor, a health check) keeps it billed all day. Today `/api/health` doesn't query the database, and it should stay that way. Awake 24/7 at 1 vCPU, it would cost about €100 a month.
2. **Cold starts against always-on.** Scaling to zero is free, but the first request after a quiet period takes 1–3 seconds. Keeping one instance always running costs about €13 a month.

## Keeping the database cost down

An in-memory cache on the server was studied and rejected:
- **It saves little.** Billing is per minute awake, not per query. Every request checks the session in Postgres, and writes always hit the database.
- **It's lost when the container scales to zero**, so wake-ups after a quiet period, the expensive part, still happen.
- **It goes stale across instances.**
- **It breaks the stateless rule.**

A shared Redis (about €35/month for the smallest node) costs more than the database it would save.

Decisions (Vince):
- **Stay on Serverless SQL Database, with the maximum set to 1 vCPU.** The worst case is then about €100/month (1 vCPU awake 24/7). The budget alert catches it long before.
- **Cache on the client with TanStack Query** (#46): set a `staleTime` on band data queries, as the session query already does. The web app then sends fewer requests and wakes the database less often.

Kept as a fallback if the bills turn out too high: the smallest managed PostgreSQL instance, **DB-DEV-S** (2 vCPU, 2 GB RAM, about €11.40/month plus about €0.50 of storage). Only `DATABASE_URL` changes. It pays off above about 85 hours awake per month.

## Setup tips

- **Budget alert:** set one in Scaleway's billing console when you create the account.
- **Domain:** if you already own one at another registrar, keep it there and add the TEM DNS records to it.

## Sources

Prices checked on 2026/10/16. Some pages are dated 2024–2025, so the .fr price and the Container Registry price are the least certain.

- [Serverless pricing](https://www.scaleway.com/en/pricing/serverless/)
- [Managed databases pricing](https://www.scaleway.com/en/pricing/managed-databases/)
- [Serverless SQL autoscaling](https://www.scaleway.com/en/docs/serverless-sql-databases/how-to/configure-autoscaling/)
- [Managed Database for Redis](https://scaleway.com/managed-database-for-redistm)
- [Serverless SQL Database FAQ](https://www.scaleway.com/en/docs/serverless-sql-databases/faq/)
- [Storage pricing](https://www.scaleway.com/en/pricing/storage/)
- [Managed services pricing (TEM, Cockpit)](https://www.scaleway.com/en/pricing/managed-services/)
- [Cockpit pricing](https://www.scaleway.com/en/docs/cockpit/reference-content/cockpit-pricing/)
- [Container Registry FAQ](https://www.scaleway.com/en/docs/container-registry/faq/)
- [Containers pricing](https://scaleway.com/en/pricing/containers)
- [Domains and DNS](https://www.scaleway.com/en/domain)
- [Secret Manager FAQ](https://www.scaleway.com/en/docs/secret-manager/faq/)
- [Security and account pricing](https://www.scaleway.com/en/pricing/security-and-account/)
