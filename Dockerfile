# Small, production-ready image for the Discord moderation bot.
FROM node:22-alpine

WORKDIR /app

# Install only production deps first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy the rest of the source.
COPY . .


ENV DATA_DIR=/data


# This is a background worker — it does not listen on a port.
CMD ["node", "index.js"]
