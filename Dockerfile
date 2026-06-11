FROM node:20-alpine

WORKDIR /app
COPY package.json ./
COPY outputs ./outputs

ENV PORT=4174
EXPOSE 4174

CMD ["node", "outputs/server.mjs"]
