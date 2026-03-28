
FROM mcr.microsoft.com/playwright:v1.42.0-jammy


RUN npm install -g pnpm


WORKDIR /app


COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./


COPY apps/*/package.json ./apps/
COPY packages/*/package.json ./packages/


RUN pnpm install --frozen-lockfile


COPY . .


EXPOSE 3000
EXPOSE 5173


CMD ["pnpm", "run", "dev"]

