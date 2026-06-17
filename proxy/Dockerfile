# Tiny free-tier LLM proxy for the QuranGraph assistant. Zero runtime dependencies —
# just the Node runtime and proxy.mjs, so there's nothing to npm-install.
FROM node:22-alpine
WORKDIR /app
COPY package.json proxy.mjs ./
ENV PORT=8080
EXPOSE 8080
# Run as the built-in unprivileged user.
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:8080/api/health >/dev/null 2>&1 || exit 1
CMD ["node", "proxy.mjs"]
