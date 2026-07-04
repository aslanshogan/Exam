"use client";

import { useEffect, useRef, useState } from "react";
import type { ThemeSettings } from "@/lib/themeTypes";

/**
 * UserMusicPlayer
 * ---------------------------------------------------------------------
 * Implements the "safe autoplay" pattern requested:
 *   1. If music_enabled + music_autoplay, try to play as soon as the
 *      audio element mounts.
 *   2. Browsers commonly block autoplay WITH SOUND. If play() rejects
 *      (caught here), we don't treat it as an error — we just show a
 *      clean "Tap to enable sound" overlay button.
 *   3. After the user taps once, audio plays (this user gesture is
 *      enough to satisfy every major browser's autoplay policy).
 *   4. A small fixed control bar always offers Play/Pause, Mute/Unmute,
 *      and a volume slider, regardless of how playback started.
 *
 * Renders nothing at all if music_enabled is false or no music_url is set.
 */
export default function UserMusicPlayer({ theme }: { theme: ThemeSettings }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(theme.music_volume / 100);

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
          // Autoplay-with-sound was blocked — this is expected/normal.
          setNeedsTapToPlay(true);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme.music_enabled, theme.music_url, theme.music_autoplay]);

  if (!theme.music_enabled || !theme.music_url) return null;

  function enableSound() {
    const audio = audioRef.current;
    if (!audio) return;
    audio
      .play()
      .then(() => {
        setIsPlaying(true);
        setNeedsTapToPlay(false);
      })
      .catch(() => {
        /* still blocked — leave the tap prompt up */
      });
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => setNeedsTapToPlay(true));
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
      <audio ref={audioRef} src={theme.music_url} loop={theme.music_loop} />

      {needsTapToPlay && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <button
            onClick={enableSound}
            className="bg-white text-navy-900 font-bold px-6 py-4 rounded-2xl shadow-2xl text-lg"
          >
            🔊 Tap to enable sound
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
      </div>
    </>
  );
}
