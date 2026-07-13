FROM mcr.microsoft.com/playwright:v1.42.1-jammy

WORKDIR /app/stanley-cloud-run
COPY stanley-cloud-run/package.json ./
RUN npm install --omit=dev
COPY stanley-cloud-run/ ./
COPY GPT-Additions/cloud-run-api/scripts/patchEngine.js /tmp/patchEngine.js
RUN node /tmp/patchEngine.js /app/stanley-cloud-run/branchingEngine.js

WORKDIR /app/GPT-Additions/cloud-run-api
COPY GPT-Additions/cloud-run-api/package.json ./
RUN npm install --omit=dev
COPY GPT-Additions/cloud-run-api/ ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/server.js"]
