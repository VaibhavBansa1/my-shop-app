# syntax=docker/dockerfile:1.7
# Production image for My Shop App (web + worker + migrations use the same image).
#   docker build -t myshop .
#   docker run --env-file .env.production -p 3000:3000 myshop            # web
#   docker run --env-file .env.production myshop node scripts/worker.mjs  # worker
#   docker run --env-file .env.production myshop node scripts/migrate.mjs # migrations

# Base image is a build argument so you can use a mirror/private registry (e.g. when Docker Hub rate-limits).
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Optional: behind a TLS-inspecting proxy, pass its CA:  docker build --secret id=ca,src=/path/ca.crt …
RUN --mount=type=secret,id=ca,required=false NODE_EXTRA_CA_CERTS=/run/secrets/ca npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=ca,required=false NODE_EXTRA_CA_CERTS=/run/secrets/ca npm ci --ignore-scripts
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# Non-root user; the app never writes to its own files.
RUN groupadd --system --gid 10001 app && useradd --system --uid 10001 --gid app --home /app app
# Next.js standalone server + static assets
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Worker, migrations and scripts need the full production node_modules and source
COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app lib ./lib
COPY --chown=app:app shared ./shared
COPY --chown=app:app scripts ./scripts
COPY --chown=app:app db ./db
COPY --chown=app:app docs/GLOSSARY.md docs/FIELDS.md ./docs/
COPY --chown=app:app package.json ./
# Default local image storage (mount a volume here, or use STORAGE_DRIVER=s3)
RUN mkdir -p /app/data/uploads && chown -R app:app /app/data
USER 10001:10001
EXPOSE 3000 9091
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
