# Production image for the e-commerce backend.
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching).
COPY package*.json ./
RUN npm ci --omit=dev

# App source.
COPY . .

EXPOSE 3000

# server.js starts the HTTP server + Socket.io and connects to Mongo.
CMD ["node", "server.js"]
