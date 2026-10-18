# ProtoTrip for Koyeb (or any container host). No dependencies to install: plain Node.
FROM node:24-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8000 \
    TRUST_PROXY=1

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public

# Run as the unprivileged "node" user; it only needs to write the airport-directory cache.
RUN mkdir -p .cache && chown -R node:node /app
USER node

EXPOSE 8000
CMD ["node", "server/index.js"]
