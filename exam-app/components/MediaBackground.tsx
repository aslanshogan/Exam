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

  const showVideo = theme.background_video_enabled && theme.background_video_url && !videoStopped;
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
          <button
            onClick={() => setVideoStopped(true)}
            className="absolute bottom-4 right-4 z-10 bg-black/50 hover:bg-black/70 text-white text-xs px-3 py-1.5 rounded-full"
          >
            Stop video
          </button>
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
    </>
  );
}
