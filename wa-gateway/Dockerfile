FROM node:22-alpine

WORKDIR /app

COPY package*.json .npmrc ./
RUN npm install --omit=dev

COPY src ./src
COPY public ./public

ENV NODE_ENV=production
EXPOSE 3010

CMD ["npm", "start"]
