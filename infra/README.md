# Production infrastructure (Scaleway)

Everything the app runs on, described with [OpenTofu](https://opentofu.org): one Serverless Container (API plus the built web app) at `https://app.<domain>`, a Serverless SQL Database, a private Object Storage bucket, Transactional Email on the domain, a private Container Registry, two IAM applications and a monthly budget with alerts. Costs: `briefs/claude/007_scaleway-products.md`.

Day to day, nothing happens here: every push to `main` whose CI passes is deployed by `.github/workflows/deploy.yml` (build and push the image, run migrations, roll out the container, check `/api/health`). OpenTofu is only for setting up and changing the infrastructure.

| File | What |
|---|---|
| `versions.tf` | Providers, state backend (Object Storage) and state encryption |
| `registry.tf` | Private registry for the image |
| `database.tf` | Serverless SQL Database (scales to 0, at most 1 vCPU) |
| `storage.tf` | Private bucket for files |
| `email.tf` | TEM domain (DNS records written by autoconfig) |
| `iam.tf` | `coverband-app` (data, files, SMTP) and `coverband-deploy` (registry, container, schema changes) |
| `container.tf` | Container, its environment and secrets, the `app.<domain>` custom domain |
| `budget.tf` | Monthly budget, alerts at 50%, 90% and 100% |

## First setup

Done once, in this order. Tools: `tofu` (1.10 or later), `docker`, `gh`.

1. **Scaleway account:** create it, verify your identity, add a payment method. Note the project ID (Project settings) and the organization ID (Organization settings).
2. **Your own API key** (IAM > API keys, for your user, default project = this project). OpenTofu uses it, and so does the state backend (S3 API):

   ```sh
   export SCW_ACCESS_KEY=SCW... SCW_SECRET_KEY=...
   export AWS_ACCESS_KEY_ID=$SCW_ACCESS_KEY AWS_SECRET_ACCESS_KEY=$SCW_SECRET_KEY
   ```

3. **Domain:** buy it in Domains & DNS. Scaleway then hosts its DNS zone, where OpenTofu and TEM write their records.
   **Transactional Email:** subscribe the project to the Essential plan (Transactional Email in the console; 300 emails a month free). Without it, the TEM domain is refused (`No active offer subscription`), and OpenTofu can't subscribe for you.
4. **State bucket:** in Object Storage, create a private bucket in Paris (`fr-par`), for example `coverband-tfstate-<something>`, with versioning on (to recover an older state).
5. **Settings:**

   ```sh
   cd infra
   cp terraform.tfvars.example terraform.tfvars   # fill in project_id, organization_id, domain, admin_email, mail_from
   export TF_VAR_state_passphrase='...'           # 16+ characters, in your password manager: without it the state is lost
   tofu init -backend-config="bucket=coverband-tfstate-<something>"
   ```

6. **What the container needs before it starts:** the registry with a first image (later the deploy workflow pushes them), and the database with its tables (the app reads them at startup). Push the image and run the migrations by hand once:

   ```sh
   tofu apply -target=scaleway_registry_namespace.main -target=scaleway_sdb_sql_database.main \
     -target=scaleway_iam_policy.deploy -target=scaleway_iam_api_key.deploy
   IMAGE="$(tofu output -raw registry_image)"
   echo "$SCW_SECRET_KEY" | docker login rg.fr-par.scw.cloud -u nologin --password-stdin
   docker build -t "${IMAGE}:latest" .. && docker push "${IMAGE}:latest"   # braces: in zsh, $IMAGE:l... is a modifier
   docker logout rg.fr-par.scw.cloud
   (cd .. && DATABASE_URL="$(tofu -chdir=infra output -raw deploy_database_url)" bun run db:migrate)
   ```

   A new IAM policy can take a minute to apply: if the migration is refused, run it again.
7. **Everything else:** `tofu apply`. Waiting for TEM to validate the domain can take a while: if it times out, run `tofu apply` again. Budget alerts created right after their budget can be refused (`Budget ... is not found`): `tofu apply` again creates the missing ones.
8. **GitHub:** `./github-secrets.sh` creates the `production` environment with the deploy key, the migration database URL, the container ID, the image name and the app URL. From then on, every push to `main` deploys (Actions > Deploy > Run workflow to redeploy by hand).
9. **The app URL** (`tofu output app_url`) works once Scaleway has issued the TLS certificate of the custom domain, a few minutes after the apply. Meanwhile, `tofu output container_endpoint` is the container's own URL (logins are refused there: it isn't the app URL).
10. **Reminder:** `tofu output api_keys_expire_at` is the date both API keys expire (a year from now). Put a reminder a month before (see Changing the infrastructure).
11. **Log in** at the app URL as `admin_email`, with the password from `tofu output -raw admin_password`, and change it.
12. **Check the client IP** (login rate limiting is per IP, read from `X-Forwarded-For`): after logging in, look at the IP of your session.

    ```sh
    psql "$(tofu output -raw deploy_database_url)" -c "select ip_address from sessions order by created_at desc limit 1"
    ```

    - Your public IP: nothing to do.
    - Empty: Scaleway's proxy sends several addresses. Find out which are its own, set them in `trusted_proxies` in `terraform.tfvars`, `tofu apply`, log in again and check again. Never trust the whole header: a client could then pick its own IP and dodge the limit.

## Changing the infrastructure

```sh
cd infra
export SCW_ACCESS_KEY=... SCW_SECRET_KEY=... AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... TF_VAR_state_passphrase=...
tofu plan
tofu apply
```

- **The image is not managed here** (`ignore_changes`): the deploy workflow sets it. To roll back, run the Deploy workflow on an older commit, or set an older `<sha>` tag in the console. Migrations are not rolled back.
- **A new environment variable:** add it to `apps/api/src/env.ts`, `.env.example` and `container.tf` (`secret_environment_variables` for anything secret), then `tofu apply` before merging the code that needs it.
- **Cold starts:** the container scales to zero (1 to 3 s for the first request after a quiet period). `min_scale = 1` keeps one instance running, for about €13 a month.
- **API keys expire after a year** (the organization's rule): `tofu output api_keys_expire_at` gives the date, keep a reminder a month before. To rotate both:

  ```sh
  tofu apply -replace=scaleway_iam_api_key.app -replace=scaleway_iam_api_key.deploy
  ./github-secrets.sh
  ```

  The container gets its new key from the apply (it redeploys with the new secrets); the deploy workflow gets its own from `github-secrets.sh`. A leaked key is rotated the same way.
- **Logs:** Cockpit, which Scaleway opens for every project (Observability > Cockpit, the Serverless Containers dashboards).
