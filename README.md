# Project Stanley - Consumer Browser Assistant

Project Stanley is a browser automation framework designed to run locally, bypass web security barriers (like Cloudflare, Geoblocking, and Device Fingerprints), and perform complex extraction and scraping operations.

## Architecture

The project is structured into three clear pillars:

1. **`foundationAgent.ts` (Base Agent)**: 
   Handles browser initialization, context lifecycles, action tracking, state serialization (cookies & storage), and click timeline logging. It establishes the baseline "Record-and-Generalize" macro builder.
   
2. **`Onboarding/onboardingAgent.ts` (Scraping & Mapping)**:
   Focuses on visual layout analysis and programmatic access tree mapping. It logs into legacy competitor directories (e.g., Mindbody, Vagaro), extracts customer data tables, and normalizes them into Bridgeway's native data formats.

3. **`Skeleton_Key/networkSniffer.ts` (API Decryption Utility)**:
   Launches Playwright in headful mode, attaches request/response listeners to intercept all Fetch/XHR network operations, and dumps paywalled JSON back-end data payloads directly.

## Installation & Setup

1. Install dependencies in your environment:
   ```bash
   npm install playwright dotenv
   npx playwright install chromium
   ```
2. Configure settings inside your `.env` configuration file:
   ```env
   STANLEY_HEADLESS=false
   STANLEY_USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36..."
   ```
