import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  staticFile,
  Video,
  Img
} from 'remotion';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadJetBrainsMono } from '@remotion/google-fonts/JetBrainsMono';
import './style.css';

// Load Google Fonts programmatically
const inter = loadInter();
const jetbrains = loadJetBrainsMono();

export interface StanleyAdProps {
  topHook: string;
  hookStage2?: string;
  explainerText: string;
  bottomCTA: string;
  mediaType?: 'video' | 'image' | 'none';
  mediaUrl?: string;
  bgVideo?: string;
}

export const StanleyAd: React.FC<StanleyAdProps> = ({
  topHook = "Still copying spreadsheets by hand in 2026? Unbelievable.",
  hookStage2 = "Pass off the repetitive tasks to Stanley.",
  explainerText = "Stanley automates manual browser tasks seamlessly in the background.",
  bottomCTA = "Use Stanley. Stop the torture.",
  mediaType = 'none',
  mediaUrl,
  bgVideo
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Timing segments (Intro is 7s total: Part 1 is 4s, Part 2 is 3s)
  const INTRO_PART1 = 120; // 4 seconds at 30 FPS
  const INTRO_TOTAL = 210; // 7 seconds at 30 FPS
  const TRANSITION_DURATION = 15; // 0.5 seconds fade

  // Stage 1 - Hook Part 1 (0s - 4s)
  const hook1FadeIn = spring({
    frame,
    fps,
    config: { damping: 12, mass: 0.5 },
    delay: 5
  });

  const hook1FadeOut = interpolate(
    frame,
    [INTRO_PART1 - 10, INTRO_PART1],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const hook1Opacity = hook1FadeIn * hook1FadeOut;

  // Stage 1 - Hook Part 2 (4s - 7s)
  const hook2FadeIn = interpolate(
    frame,
    [INTRO_PART1, INTRO_PART1 + 10],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const hook2FadeOut = interpolate(
    frame,
    [INTRO_TOTAL, INTRO_TOTAL + TRANSITION_DURATION],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const hook2Opacity = hook2FadeIn * hook2FadeOut;

  // Stage 2 (Showcase) Animation curves (7s - 20s)
  const showcaseOpacity = interpolate(
    frame,
    [INTRO_TOTAL, INTRO_TOTAL + TRANSITION_DURATION],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const showcaseSpring = spring({
    frame: frame - INTRO_TOTAL,
    fps,
    config: { damping: 12, mass: 0.6 },
    delay: 0
  });

  const footerY = interpolate(showcaseSpring, [0, 1], [100, 0]);

  // Overall background video fadeout
  const introBgFadeOut = interpolate(
    frame,
    [INTRO_TOTAL, INTRO_TOTAL + TRANSITION_DURATION],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Ambient glows continuous motion
  const blob1X = interpolate(
    Math.sin(frame / 30),
    [-1, 1],
    [-150, -50]
  );
  const blob2Y = interpolate(
    Math.cos(frame / 30),
    [-1, 1],
    [-100, -200]
  );

  return (
    <div className="ad-container" style={{ fontFamily: inter.fontFamily, background: '#0a0a0e' }}>
      
      {/* ================= STAGE 1: INTRO (0 - 7s) ================= */}
      {/* Background stock video is only visible during the intro stage */}
      {bgVideo && frame < INTRO_TOTAL + TRANSITION_DURATION && (
        <div style={{ opacity: introBgFadeOut, position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}>
          <Video
            src={staticFile(bgVideo)}
            muted
            loop
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundColor: 'rgba(10, 10, 14, 0.6)',
            }}
          />
        </div>
      )}

      {/* Ambient background glows (Intro stage only) */}
      {frame < INTRO_TOTAL + TRANSITION_DURATION && (
        <div style={{ opacity: introBgFadeOut }}>
          <div 
            className="glow-blob glow-1" 
            style={{ transform: `translate(${blob1X}px, ${blob2Y}px)` }} 
          />
          <div 
            className="glow-blob glow-2" 
            style={{ transform: `translate(${-blob1X}px, ${-blob2Y}px)` }} 
          />
        </div>
      )}

      {/* Part 1 hook text (0s - 4s) */}
      {frame < INTRO_PART1 && (
        <div className="intro-stage" style={{ opacity: hook1Opacity }}>
          <div className="intro-card">
            <h1 className="intro-text" style={{ fontFamily: jetbrains.fontFamily }}>
              {topHook}
            </h1>
          </div>
        </div>
      )}

      {/* Part 2 hook text (4s - 7s) */}
      {frame >= INTRO_PART1 && frame < INTRO_TOTAL + TRANSITION_DURATION && (
        <div className="intro-stage" style={{ opacity: hook2Opacity }}>
          <div className="intro-card">
            <h1 className="intro-text" style={{ fontFamily: jetbrains.fontFamily }}>
              {hookStage2}
            </h1>
          </div>
        </div>
      )}

      {/* ================= STAGE 2: SHOWCASE (7s - 20s) ================= */}
      {/* Full-bleed Product Video: starts playing from video 0s when composition frame hits 210 */}
      {frame >= INTRO_TOTAL && mediaType === 'video' && mediaUrl && (
        <Video
          src={mediaUrl.startsWith('http') ? mediaUrl : staticFile(mediaUrl)}
          startFrom={0}
          loop // Enable loop to prevent black screen when video finishes
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '1080px',
            height: '1920px',
            objectFit: 'contain', // Contain fits the whole width/height including popups uncropped
            backgroundColor: '#0a0a0e', // Dark bars on sides/top if any
            zIndex: 1,
            opacity: showcaseOpacity
          }}
        />
      )}

      {/* Stage 2 Overlays (Hook caption and branding pushed to the bottom to avoid blocking the Chrome Extension) */}
      {frame >= INTRO_TOTAL && (
        <div className="showcase-stage" style={{ opacity: showcaseOpacity }}>
          {/* Bottom overlay card */}
          <div 
            className="showcase-footer"
            style={{ transform: `translateY(${footerY}px)` }}
          >
            <p className="showcase-caption" style={{ fontFamily: jetbrains.fontFamily }}>
              {explainerText}
            </p>
            <div className="logo-container" style={{ marginTop: '5px' }}>
              <span className="logo-text">⚡ STANLEY AUTOMATION</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
