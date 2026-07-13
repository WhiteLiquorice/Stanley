FROM mcr.microsoft.com/playwright:v1.42.1-jammy

WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY stanley-cloud-run/package*.json ./
RUN npm install --omit=dev
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip && pip3 install --no-cache-dir requests beautifulsoup4 && rm -rf /var/lib/apt/lists/*

COPY stanley-cloud-run ./
COPY GPT-Additions/connector-engine ./GPT-Additions/connector-engine
COPY GPT-Additions/trust-engine ./GPT-Additions/trust-engine
COPY GPT-Additions/learning-engine ./GPT-Additions/learning-engine
COPY GPT-Additions/skill-engine ./GPT-Additions/skill-engine
COPY GPT-Additions/orchestration-engine ./GPT-Additions/orchestration-engine
COPY GPT-Additions/memory-engine ./GPT-Additions/memory-engine
COPY GPT-Additions/monitoring-engine ./GPT-Additions/monitoring-engine
COPY GPT-Additions/runner-integration ./GPT-Additions/runner-integration
COPY GPT-Additions/staging-cloud-run ./GPT-Additions/staging-cloud-run

RUN node scripts/patchEngine.js
RUN node GPT-Additions/runner-integration/scripts/patchOrchestrationHooks.js branchingEngine.js
RUN node GPT-Additions/runner-integration/scripts/patchTrustHooks.js branchingEngine.js
RUN node GPT-Additions/runner-integration/scripts/patchConnectorHooks.js branchingEngine.js
RUN node GPT-Additions/staging-cloud-run/patchContextualRunner.js src/contextualRunner.js
RUN node GPT-Additions/staging-cloud-run/patchServer.js src/server.js
RUN node --check src/server.js && node --check branchingEngine.js && node --check GPT-Additions/staging-cloud-run/vertexLearningModel.js

RUN useradd --system --uid 10001 --create-home stanley && chown -R stanley:stanley /app
USER 10001
ENV NODE_ENV=production
ENV PORT=8080
ENV STANLEY_PYTHON_BIN=/usr/bin/python3
EXPOSE 8080
CMD ["node", "src/server.js"]
