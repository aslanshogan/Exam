"use client";

import { useEffect, useRef, useState } from "react";
import type { ThemeSettings } from "@/lib/themeTypes";

/**
 * MediaBackground
 * ---------------------------------------------------------------------
 * - background video: rendered behind the page, autoplaying MUTED
 *   (browsers reliably allow muted autoplay) and looping if requested,
 *   sized with object-contain so the WHOLE video is visible (no edge
 *   cropping); letterbox space is filled with the theme background color.
 *
 *   Playback controls (bottom-right): a Pause/Play button plus a seek
 *   bar. Crucially, the <video> element STAYS MOUNTED when paused (we
 *   only call .pause()), so pressing Play resumes from the exact point
 *   it stopped instead of restarting. The seek bar shows progress and
 *   can be dragged to jump to any point.
 *
 * - else background image: fixed, full-bleed.
 * - else nothing (plain --background-color shows through).
 */
export default function MediaBackground({ theme }: { theme: ThemeSettings }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [fill, setFill] = useState(true); // true = cover whole screen, false = fit whole video

  const hasVideo = theme.background_video_enabled && !!theme.background_video_url;
  const showImage = !hasVideo && theme.background_image_url;

  // Keep the progress bar in sync with playback.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => { if (!seeking) setCurrent(v.currentTime); };
    const onMeta = () => setDuration(v.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, [seeking, hasVideo]);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  function onSeek(value: number) {
    setSeeking(true);
    setCurrent(value);
  }
  function commitSeek(value: number) {
    const v = videoRef.current;
    if (v) v.currentTime = value;
    setSeeking(false);
  }

  function fmt(s: number) {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  return (
    <>
      {hasVideo && (
        <div
          className="fixed inset-0 z-0 overflow-hidden flex items-center justify-center"
          style={{ backgroundColor: "var(--background-color)" }}
        >
          <video
            ref={videoRef}
            className={"w-full h-full " + (fill ? "object-cover" : "object-contain")}
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

      {/* Playback controls — high z-index so page content (z-10) can't
          intercept clicks. Pause keeps the video mounted (holds its
          position); the bar shows or sets the current time. */}
      {hasVideo && (
        <div className="fixed bottom-4 right-4 z-50 bg-black/60 backdrop-blur text-white rounded-full shadow-lg px-3 py-1.5 flex items-center gap-2 text-xs max-w-[min(90vw,320px)]">
          <button onClick={togglePlay} aria-label={playing ? "Pause video" : "Play video"} className="font-bold shrink-0">
            {playing ? "⏸" : "▶"}
          </button>
          <span className="tabular-nums shrink-0">{fmt(current)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={current}
            onChange={(e) => onSeek(Number(e.target.value))}
            onMouseUp={(e) => commitSeek(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => commitSeek(Number((e.target as HTMLInputElement).value))}
            className="w-24 sm:w-40 accent-white"
            aria-label="Video position"
          />
          <span className="tabular-nums shrink-0">{fmt(duration)}</span>
          <button
            onClick={() => setFill((f) => !f)}
            title={fill ? "Currently filling screen (edges may crop). Tap to fit whole video." : "Currently fitting whole video. Tap to fill screen."}
            className="shrink-0 border-l border-white/30 pl-2 ml-1"
          >
            {fill ? "⛶ Fill" : "▭ Fit"}
          </button>
        </div>
      )}
    </>
  );
}
