# Production image: the API, serving the built web app on the same origin, and the built admin app
# on its own host (#246): one container.
# Built and pushed by the deploy workflow (.github/workflows/deploy.yml); try it locally with
# `docker build -t coverband .`. Migrations are not run here: the deploy job runs them first.

FROM oven/bun:1.4.3 AS build
# Commit the image is built from (the deploy workflow passes it), shown by the web app and /api/health.
ARG BUILD_SHA=dev
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/
RUN bun install --frozen-lockfile
COPY . .
RUN BUILD_SHA=$BUILD_SHA bun run build

# Only the API's runtime dependencies: no Vite, Playwright or drizzle-kit.
FROM oven/bun:1.4.3-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/
RUN bun install --frozen-lockfile --production --filter @coverband/api && rm -rf ~/.bun/install/cache
COPY packages/shared packages/shared
COPY apps/api/src apps/api/src
COPY apps/api/tsconfig.json apps/api/
COPY tsconfig.base.json ./
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/apps/admin/dist apps/admin/dist
ARG BUILD_SHA=dev
ENV WEB_DIST_DIR=/app/apps/web/dist ADMIN_DIST_DIR=/app/apps/admin/dist BUILD_SHA=$BUILD_SHA
USER bun
# Scaleway Serverless Containers set PORT to the container's port (3000, see infra/).
EXPOSE 3000
CMD ["bun", "apps/api/src/main.ts"]
