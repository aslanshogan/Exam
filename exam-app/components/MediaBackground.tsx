"use client";

import { useState } from "react";
import type { ThemeSettings } from "@/lib/themeTypes";

/**
 * MediaBackground
 * ---------------------------------------------------------------------
 * - If background_video_enabled AND a video URL exists: renders a
 *   <video> behind the page, autoplaying MUTED (browsers reliably allow
 *   muted autoplay) and looping if requested. A small "Stop video"
 *   control lets the user pause/hide it.
 * - Else if a background_image_url exists: renders it as a fixed,
 *   full-bleed image.
 * - Else: renders nothing (the plain --background-color shows through).
 */
export default function MediaBackground({ theme }: { theme: ThemeSettings }) {
  const [videoStopped, setVideoStopped] = useState(false);

  const hasVideo = theme.background_video_enabled && !!theme.background_video_url;
  const showVideo = hasVideo && !videoStopped;
  const showImage = !showVideo && theme.background_image_url;

  return (
    <>
      {showVideo && (
        <div className="fixed inset-0 z-0 overflow-hidden">
          <video
            className="w-full h-full object-cover"
            src={theme.background_video_url!}
            autoPlay
            muted={theme.background_video_muted}
            loop={theme.background_video_loop}
            playsInline
          />
          <div className="absolute inset-0 bg-black/30" />
        </div>
      )}
      {showImage && (
        <div
          className="fixed inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${theme.background_image_url})` }}
        >
          <div className="absolute inset-0 bg-black/20" />
        </div>
      )}
      {/* Persistent toggle — always rendered when a video is configured,
          at a high z-index so page content (z-10) can't intercept its
          clicks. It flips between Stop and Play so the background video
          can be brought back without refreshing the page. */}
      {hasVideo && (
        <button
          onClick={() => setVideoStopped((s) => !s)}
          className="fixed bottom-4 right-4 z-50 bg-black/60 hover:bg-black/80 text-white text-xs px-3 py-1.5 rounded-full shadow-lg"
        >
          {videoStopped ? "▶ Play video" : "⏹ Stop video"}
        </button>
      )}
    </>
  );
}
