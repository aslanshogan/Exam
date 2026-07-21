"use client";

import { useEffect, useRef, useState } from "react";
import type { ThemeSettings } from "@/lib/themeTypes";

/**
 * UserMusicPlayer
 * ---------------------------------------------------------------------
 * Safe background music with autoplay fallback.
 *  1. If music_enabled + music_autoplay, try to play on mount.
 *  2. Browsers block autoplay-with-sound; if play() rejects we show a
 *     small, DISMISSIBLE "enable sound" prompt (not a page-blocking
 *     overlay).
 *  3. Tapping the prompt starts playback AND dismisses the prompt
 *     immediately (optimistically), so the UI can never get stuck even
 *     if the audio is slow or the file is broken. A "not now" option
 *     also dismisses it without sound.
 *  4. A small fixed control bar offers play/pause, mute, and volume.
 *
 * Renders nothing if music_enabled is false or no music_url is set.
 */
export default function UserMusicPlayer({ theme }: { theme: ThemeSettings }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(theme.music_volume / 100);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!theme.music_enabled || !theme.music_url) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;

    if (theme.music_autoplay) {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          // Autoplay-with-sound blocked — expected. Offer a small prompt.
          setShowPrompt(true);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme.music_enabled, theme.music_url, theme.music_autoplay]);

  if (!theme.music_enabled || !theme.music_url) return null;

  function enableSound() {
    // Dismiss the prompt IMMEDIATELY so the UI can never freeze waiting
    // on the audio; then attempt playback in the background.
    setShowPrompt(false);
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().then(() => setIsPlaying(true)).catch(() => {
      // If it still fails, don't re-block the screen — just leave the
      // control bar's ▶ button available for a manual retry.
      setIsPlaying(false);
    });
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  }

  function toggleMute() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !muted;
    setMuted(!muted);
  }

  function handleVolume(v: number) {
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  }

  return (
    <>
      <audio
        ref={audioRef}
        src={theme.music_url}
        loop={theme.music_loop}
        onError={() => { setLoadError(true); setShowPrompt(false); }}
      />

      {/* Small, dismissible prompt in the corner — NOT a full-screen
          blocker, so it can never trap the page. */}
      {showPrompt && !loadError && (
        <div className="fixed bottom-20 left-4 z-50 bg-white rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 text-sm max-w-xs">
          <button onClick={enableSound} className="bg-navy-900 text-white font-bold px-4 py-2 rounded-lg">
            🔊 Enable sound
          </button>
          <button onClick={() => setShowPrompt(false)} className="text-gray-500 hover:underline">
            Not now
          </button>
        </div>
      )}

      <div className="fixed bottom-4 left-4 z-40 bg-white/95 backdrop-blur rounded-full shadow-card px-4 py-2 flex items-center gap-3 text-sm">
        <button onClick={togglePlay} aria-label="Play or pause music" className="font-bold">
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button onClick={toggleMute} aria-label="Mute or unmute music">
          {muted ? "🔇" : "🔊"}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => handleVolume(Number(e.target.value))}
          className="w-20"
          aria-label="Music volume"
        />
        {loadError && <span className="text-xs text-red-500">Music file couldn't load</span>}
      </div>
    </>
  );
}
