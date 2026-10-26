FROM node:22-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages packages
RUN npm ci

COPY apps/api apps/api
RUN npm run build --workspace=@workflow/contracts \
  && npm run build --workspace=@workflow/api

FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app
LABEL org.opencontainers.image.source="https://github.com/phuuthanh-dev/workflow-automation"
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/workflow-contracts/package.json packages/workflow-contracts/package.json
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
  --workspace=@workflow/api \
  --workspace=@workflow/contracts \
  --include-workspace-root=false
COPY --from=build /app/apps/api/node_modules/@prisma ./apps/api/node_modules/@prisma
COPY --from=build /app/apps/api/node_modules/prisma ./apps/api/node_modules/prisma
COPY --from=build /app/apps/api/node_modules/.bin/prisma ./apps/api/node_modules/.bin/prisma
COPY --from=build /app/apps/api/node_modules/.prisma ./apps/api/node_modules/.prisma
COPY --from=build /app/apps/api/node_modules/@prisma/client ./apps/api/node_modules/@prisma/client
COPY --from=build /app/packages/workflow-contracts/package.json ./packages/workflow-contracts/package.json
COPY --from=build /app/packages/workflow-contracts/dist ./packages/workflow-contracts/dist
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma

EXPOSE 3001
USER node
CMD ["node", "apps/api/dist/main.js"]

