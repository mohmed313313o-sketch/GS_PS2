FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN npm install -g corepack@latest && corepack enable
COPY package.json pnpm-lock.yaml ./
RUN corepack pnpm install

COPY . .
RUN corepack pnpm run build
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
