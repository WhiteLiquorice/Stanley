# Playwright's official image ships Chromium + all system deps at a pinned version.
# Keep this tag in sync with the "playwright" version in package.json.
FROM mcr.microsoft.com/playwright:v1.42.1-jammy

WORKDIR /app

# Install only production deps. Browsers are already present in the base image,
# so skip the post-install browser download.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package*.json ./
RUN npm ci --omit=dev

# Install Python3 for API scripting fallbacks
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip \
    && pip3 install --no-cache-dir requests beautifulsoup4 \
    && rm -rf /var/lib/apt/lists/*

# App source (engine files are flat copies of the desktop daemon — see README).
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
# New runner revisions use the fully implemented reliability profile. Operators
# can set STANLEY_RELIABILITY_V2=false on a revision for an immediate compatibility rollback.
ENV STANLEY_RELIABILITY_V2=true
EXPOSE 8080
CMD ["node", "src/server.js"]
