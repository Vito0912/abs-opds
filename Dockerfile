FROM node:26-alpine AS base

ENV CI=true

RUN npm install -g pnpm

WORKDIR /home/node/app

# Build the TypeScript sources with the full dependency set.
FROM base AS build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build

# Resolve the runtime dependency set on its own so the final image carries no
# build tooling (TypeScript, Prettier) along with it.
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:26-alpine AS runtime

ENV NODE_ENV=production

WORKDIR /home/node/app

COPY --from=deps --chown=node:node /home/node/app/node_modules ./node_modules
COPY --from=build --chown=node:node /home/node/app/dist ./dist
COPY --chown=node:node package.json ./

USER node

EXPOSE 3010

CMD ["node", "dist/index.js"]
