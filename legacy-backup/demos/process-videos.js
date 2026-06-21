'use strict';
/**
 * Stanley reel renderer
 * Trims and speed-ramps the already-portrait 1080x1920 .webm files.
 * No scale, no crop, no burned-in captions (add text in DaVinci or Instagram).
 *
 * Usage:
 *   node demos/process-videos.js             # all videos
 *   node demos/process-videos.js 1 3 5       # specific demos by number
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MANIFEST   = path.join(__dirname, 'manifest.json');
const INPUT_DIR  = path.join(__dirname, 'output');
const OUTPUT_DIR = path.join(__dirname, 'output', 'reels');

// Full path to ffmpeg binary on A drive
const BIN_DIR = 'A:\\tools\\ffmpeg\\ffmpeg-8.1.1-essentials_build\\bin';
const FFMPEG  = fs.existsSync(path.join(BIN_DIR, 'ffmpeg.exe'))
  ? `"${path.join(BIN_DIR, 'ffmpeg.exe')}"`
  : 'ffmpeg';
const FFPROBE = fs.existsSync(path.join(BIN_DIR, 'ffprobe.exe'))
  ? `"${path.join(BIN_DIR, 'ffprobe.exe')}"`
  : 'ffprobe';

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── helpers ──────────────────────────────────────────────────────────────────

function getDuration(filePath) {
  try {
    const out = execSync(
      `${FFPROBE} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return parseFloat(out.trim()).toFixed(1);
  } catch (_) {
    return '?';
  }
}

// ── core renderer ─────────────────────────────────────────────────────────────

function processVideo(video) {
  const inputPath  = path.join(INPUT_DIR, video.input);
  const outputPath = path.join(OUTPUT_DIR, video.output);
  const n          = video.cuts.length;

  console.log(`\n▶  ${video.input}  (${getDuration(inputPath)}s)`);

  // Build filter_complex:
  // 1. Split source into N copies (one per cut)
  // 2. Trim each copy to its time range and adjust speed
  // 3. Concat all segments into [final]
  //
  // No scale/crop — footage is already 1080x1920 native portrait.
  // No drawtext — add titles in DaVinci or Instagram.

  let fc = `[0:v]split=${n}`;
  fc += video.cuts.map((_, i) => `[b${i}]`).join('');
  fc += ';';

  video.cuts.forEach((cut, i) => {
    const pts = (1.0 / cut.speed).toFixed(6);
    fc += `[b${i}]trim=start=${cut.start}:end=${cut.end},setpts=${pts}*PTS,setsar=1[v${i}];`;
  });

  fc += video.cuts.map((_, i) => `[v${i}]`).join('');
  fc += `concat=n=${n}:v=1:a=0[final]`;

  const cmd = [
    FFMPEG, '-y',
    `-i "${inputPath}"`,
    `-filter_complex "${fc}"`,
    '-map "[final]"',
    '-c:v libx264 -preset fast -crf 22',
    '-pix_fmt yuv420p',
    '-movflags +faststart',
    '-an',
    `"${outputPath}"`
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'inherit' });
    console.log(`   ✓  ${video.output}`);
  } catch (_) {
    console.error(`   ✗  Failed — check ffmpeg output above`);
  }
}

// ── entry point ───────────────────────────────────────────────────────────────

const filter = process.argv.slice(2);

let videos = manifest.videos;
if (filter.length > 0) {
  videos = videos.filter(v =>
    filter.some(n => v.input.startsWith(n.padStart(2, '0')))
  );
}

if (videos.length === 0) {
  console.log('No matching videos found.');
  process.exit(0);
}

console.log(`\nStanley reel renderer — ${videos.length} video(s)`);
console.log(`Input  → ${INPUT_DIR}`);
console.log(`Output → ${OUTPUT_DIR}`);

for (const video of videos) {
  const inputPath = path.join(INPUT_DIR, video.input);
  if (fs.existsSync(inputPath)) {
    processVideo(video);
  } else {
    console.warn(`\n   ⚠  Skipping (not found): ${video.input}`);
  }
}

console.log('\n── Done ──');
