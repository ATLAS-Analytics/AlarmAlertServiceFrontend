FROM node:22 AS builder

LABEL maintainer="Ilija Vukotic <ivukotic@cern.ch>"

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-slim AS runner

WORKDIR /usr/src/app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=80 \
    HOSTNAME=0.0.0.0

COPY --from=builder /usr/src/app/.next/standalone ./
COPY --from=builder /usr/src/app/.next/static ./.next/static
COPY --from=builder /usr/src/app/public ./public

EXPOSE 80

CMD [ "node", "server.js" ]
