# The Cutscene share server. The build bundles @cutscene/trace and yjs into one file,
# so the runtime image carries only that file and node built-ins — no node_modules, no
# workspace, and none of the TypeScript type-stripping the source-run needs.
FROM node:22-slim AS build
RUN corepack enable && corepack prepare pnpm@11.6.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @cutscene/server build

FROM node:22-slim AS runtime
WORKDIR /app
COPY --from=build /repo/packages/server/dist/index.js ./index.js
# Recordings live on a mounted volume so retention and the store survive restarts.
ENV CUTSCENE_DATA=/data
ENV PORT=8080
EXPOSE 8080
VOLUME ["/data"]
CMD ["node", "index.js"]
