import { registerRoot, Composition } from 'remotion';
import { StanleyAd, StanleyAdProps } from './StanleyAd';
import React from 'react';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="StanleyAd"
        component={StanleyAd}
        durationInFrames={600} // 20 seconds at 30 FPS
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          topHook: "Still copying spreadsheets by hand in 2026? Unbelievable.",
          hookStage2: "Pass off the repetitive tasks to Stanley.",
          bottomCTA: "Use Stanley. Stop the torture.",
          mediaType: "none",
          bgVideo: "pexels/7610983-hd_1080_1920_30fps.mp4",
          explainerText: "Stanley runs workflows in the background without opening a browser."
        } as StanleyAdProps}
      />
    </>
  );
};

registerRoot(RemotionRoot);
