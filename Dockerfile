# syntax=docker/dockerfile:1
#
# Shap3D.ai in a container – two targets:
#
#   dev (default)  the Vite dev server with the remote API: REST at /api, Swagger UI at /api/docs, MCP at /mcp
#                  docker build -t shap3d-ai .            docker run --rm -p 127.0.0.1:5173:5173 shap3d-ai
#   static         the production build served by nginx (no remote API – it needs the dev server)
#                  docker build --target static -t shap3d-ai:static .   docker run --rm -p 127.0.0.1:8080:80 shap3d-ai:static
#
# Or simply: docker compose up   (see compose.yaml)

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY --chown=node:node . .
RUN npm run build

FROM nginx:1.27-alpine AS static
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

# last stage = what `docker build` makes without --target
FROM deps AS dev
COPY --chown=node:node . .
# files the MCP tool export_model writes (mount a volume here to get them out)
RUN mkdir -p /app/exports
ENV NODE_ENV=development
EXPOSE 5173
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:5173/api/status').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
# --host: reachable through the published port; the remote API itself still only accepts this computer (localhost origins, programs)
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]
