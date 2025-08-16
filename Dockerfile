# --- Builder ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
# Install with npm by default
RUN if [ -f package-lock.json ]; then npm ci;     elif [ -f pnpm-lock.yaml ]; then npm i -g pnpm && pnpm i --frozen-lockfile;     elif [ -f yarn.lock ]; then yarn install --frozen-lockfile;     else npm i; fi
COPY . .
RUN npm run build

# --- Runner ---
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Add non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S mcp -u 1001

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json .

# Change ownership to non-root user
RUN chown -R mcp:nodejs /app
USER mcp

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health/ready', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["node", "dist/server.js"]
