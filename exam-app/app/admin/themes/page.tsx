"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import AdminSidebar from "@/components/AdminSidebar";
import ThemeEditorForm, { DEFAULT_THEME_FORM, ThemeFormValues } from "@/components/ThemeEditorForm";

export default function AdminThemesPage() {
  const [defaultTheme, setDefaultTheme] = useState<ThemeFormValues | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [musicGloballyEnabled, setMusicGloballyEnabled] = useState(true);
  const [savingSetting, setSavingSetting] = useState(false);

  useEffect(() => {
    fetch("/api/admin/themes/default")
      .then((r) => r.json())
      .then((d) => {
        const t = d.theme;
        setDefaultTheme(
          t
            ? {
                background_color: t.background_color,
                accent_color: t.accent_color,
                card_color: t.card_color,
                button_color: t.button_color,
                text_color: t.text_color,
                background_image_url: t.background_image_url || "",
                background_video_url: t.background_video_url || "",
                background_video_enabled: t.background_video_enabled,
                background_video_muted: t.background_video_muted,
                background_video_loop: t.background_video_loop,
                music_url: t.music_url || "",
                music_enabled: t.music_enabled,
                music_autoplay: t.music_autoplay,
                music_loop: t.music_loop,
                music_volume: t.music_volume,
              }
            : DEFAULT_THEME_FORM
        );
      });
    fetch("/api/admin/users").then((r) => r.json()).then((d) => setUsers(d.users || []));
    fetch("/api/admin/settings").then((r) => r.json()).then((d) => setMusicGloballyEnabled(d.settings?.music_globally_enabled ?? true));
  }, []);

  async function toggleGlobalMusic() {
    setSavingSetting(true);
    const next = !musicGloballyEnabled;
    await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ music_globally_enabled: next }),
    });
    setMusicGloballyEnabled(next);
    setSavingSetting(false);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 w-full flex gap-6">
        <AdminSidebar />
        <div className="flex-1 space-y-6">
          <h1 className="text-2xl font-bold text-navy-900">Themes</h1>

          <div className="card p-5 flex items-center justify-between">
            <div>
              <p className="font-semibold text-navy-900">Music globally enabled</p>
              <p className="text-xs text-gray-500">
                Instantly disables music app-wide (Home, Exam, Result) regardless of any individual user's settings.
              </p>
            </div>
            <button
              onClick={toggleGlobalMusic}
              disabled={savingSetting}
              className={`px-4 py-2 rounded-full text-sm font-bold ${musicGloballyEnabled ? "bg-brandGreen/15 text-brandGreen-700" : "bg-red-100 text-red-700"}`}
            >
              {musicGloballyEnabled ? "Enabled" : "Disabled"}
            </button>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-navy-900 mb-1">Global Default Theme</h2>
            <p className="text-xs text-gray-500 mb-4">
              Applied to the public Home page before login, and to any user without a personal theme override.
            </p>
            {defaultTheme && <ThemeEditorForm initial={defaultTheme} saveEndpoint="/api/admin/themes/default" />}
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 bg-navy-900 text-white font-semibold">Per-User Theme Presets</div>
            <table className="w-full text-sm">
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-3 font-medium text-navy-900">{u.display_name}</td>
                    <td className="px-4 py-3 text-gray-500">{u.role_id}</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${u.id}?tab=theme`} className="text-teal-700 hover:underline">
                        Edit Theme →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
