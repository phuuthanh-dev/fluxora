FROM node:22-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages packages
RUN npm ci

COPY apps/web apps/web
RUN npm run build --workspace=@workflow/contracts \
  && npm run build --workspace=@workflow/web

FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages packages
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --from=build /app/packages/workflow-contracts ./packages/workflow-contracts
COPY --from=build /app/apps/web/.next ./apps/web/.next

EXPOSE 3000
USER node
CMD ["npm", "run", "start", "--workspace=@workflow/web"]

