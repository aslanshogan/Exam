"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ThemeSettings } from "@/lib/themeTypes";
import MediaBackground from "./MediaBackground";
import UserMusicPlayer from "./UserMusicPlayer";

type ThemeContextValue = {
  theme: ThemeSettings;
  setTheme: (t: ThemeSettings) => void; // used by the Admin theme-preview screen
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

/**
 * ThemeProvider
 * ---------------------------------------------------------------------
 * Wrap any page with this and pass the theme resolved server-side (see
 * lib/themeServer.ts). It:
 *   1. Applies the 5 CSS variables (--background-color, --accent-color,
 *      --card-color, --button-color, --text-color) to :root.
 *   2. Renders <MediaBackground> (image or video) behind the content.
 *   3. Renders <UserMusicPlayer> (small fixed control bar + autoplay
 *      with the "tap to enable sound" fallback).
 *
 * `musicGloballyEnabled` lets a Super Admin kill all music app-wide via
 * app_settings.music_globally_enabled without touching every user's
 * individual theme row.
 */
export default function ThemeProvider({
  initialTheme,
  musicGloballyEnabled = true,
  children,
}: {
  initialTheme: ThemeSettings;
  musicGloballyEnabled?: boolean;
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState<ThemeSettings>(initialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--background-color", theme.background_color);
    root.style.setProperty("--accent-color", theme.accent_color);
    root.style.setProperty("--card-color", theme.card_color);
    root.style.setProperty("--button-color", theme.button_color);
    root.style.setProperty("--text-color", theme.text_color);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <div style={{ backgroundColor: "var(--background-color)", color: "var(--text-color)" }} className="min-h-screen relative">
        <MediaBackground theme={theme} />
        <div className="relative z-10">{children}</div>
        {musicGloballyEnabled && <UserMusicPlayer theme={theme} />}
      </div>
    </ThemeContext.Provider>
  );
}
