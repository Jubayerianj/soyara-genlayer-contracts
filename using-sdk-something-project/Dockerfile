# Lightweight Node.js container for 24/7 Soyara Keeper Daemon
FROM node:20-alpine

WORKDIR /app

# Copy package and dependencies
COPY package*.json ./
COPY ../sdk /app/sdk

RUN npm install --omit=dev

# Copy project files
COPY . .

# Start the 24/7 Keeper Daemon
CMD ["node", "scripts/keeper-daemon.mjs"]
