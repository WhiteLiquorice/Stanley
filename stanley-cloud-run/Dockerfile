# Playwright's official image ships Chromium + all system deps at a pinned version.
# Keep this tag in sync with the "playwright" version in package.json.
FROM mcr.microsoft.com/playwright:v1.42.1-jammy

WORKDIR /app

# Install only production deps. Browsers are already present in the base image,
# so skip the post-install browser download.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package*.json ./
RUN npm install --omit=dev

# Install Python3 for API scripting fallbacks
RUN apt-get update && apt-get install -y python3 python3-pip && pip3 install requests beautifulsoup4

# App source (engine files are flat copies of the desktop daemon — see README).
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/server.js"]
