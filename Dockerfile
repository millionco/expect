# Use Playwright's official image for browser support
FROM mcr.microsoft.com/playwright:v1.42.0-jammy

# Install pnpm globally
RUN npm install -g pnpm

WORKDIR /app

# Copy configuration files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy sub-package manifests
COPY apps/*/package.json ./apps/
COPY packages/*/package.json ./packages/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy everything else
COPY . .

# Expose common ports (3000 for web, 5173 for Vite)
EXPOSE 3000
EXPOSE 5173

# Start the app in development mode
CMD ["pnpm", "run", "dev"]