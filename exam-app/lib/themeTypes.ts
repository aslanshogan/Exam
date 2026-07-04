export type ThemeSettings = {
  user_id: string | null;
  background_color: string;
  accent_color: string;
  card_color: string;
  button_color: string;
  text_color: string;

  background_image_url: string | null;

  background_video_url: string | null;
  background_video_enabled: boolean;
  background_video_muted: boolean;
  background_video_loop: boolean;

  music_url: string | null;
  music_enabled: boolean;
  music_autoplay: boolean;
  music_loop: boolean;
  music_volume: number; // 0-100
};

export const FALLBACK_THEME: ThemeSettings = {
  user_id: null,
  background_color: "#F4F6F8",
  accent_color: "#00C389",
  card_color: "#FFFFFF",
  button_color: "#00C389",
  text_color: "#0B1E33",
  background_image_url: null,
  background_video_url: null,
  background_video_enabled: false,
  background_video_muted: true,
  background_video_loop: true,
  music_url: null,
  music_enabled: false,
  music_autoplay: true,
  music_loop: true,
  music_volume: 50,
};
