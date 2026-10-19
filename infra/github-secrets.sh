#!/bin/sh
# Copies the deploy workflow's settings from the OpenTofu outputs to the repository's
# "production" environment on GitHub. Run from infra/ after `tofu apply`; needs `gh` logged in.
set -eu

env=production
gh api -X PUT "repos/{owner}/{repo}/environments/$env" --silent

tofu output -raw deploy_secret_key | gh secret set SCW_SECRET_KEY --env "$env"
tofu output -raw deploy_database_url | gh secret set DEPLOY_DATABASE_URL --env "$env"
gh variable set SCW_CONTAINER_ID --env "$env" --body "$(tofu output -raw container_id)"
gh variable set SCW_REGISTRY_IMAGE --env "$env" --body "$(tofu output -raw registry_image)"
gh variable set APP_URL --env "$env" --body "$(tofu output -raw app_url)"

echo "GitHub environment '$env' configured"
