"use client";

import { useState } from "react";

export type ThemeFormValues = {
  background_color: string;
  accent_color: string;
  card_color: string;
  button_color: string;
  text_color: string;
  background_image_url: string;
  background_video_url: string;
  background_video_enabled: boolean;
  background_video_muted: boolean;
  background_video_loop: boolean;
  music_url: string;
  music_enabled: boolean;
  music_autoplay: boolean;
  music_loop: boolean;
  music_volume: number;
};

export const DEFAULT_THEME_FORM: ThemeFormValues = {
  background_color: "#0B1E33",
  accent_color: "#00C389",
  card_color: "#FFFFFF",
  button_color: "#00C389",
  text_color: "#0B1E33",
  background_image_url: "",
  background_video_url: "",
  background_video_enabled: false,
  background_video_muted: true,
  background_video_loop: true,
  music_url: "",
  music_enabled: false,
  music_autoplay: true,
  music_loop: true,
  music_volume: 50,
};

async function uploadFile(file: File, kind: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("kind", kind);
  const res = await fetch("/api/admin/media/upload", { method: "POST", body: formData });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { error: text || `Upload failed (HTTP ${res.status}).` }; }
  if (!res.ok) {
    if (res.status === 401) throw new Error("Session expired, please sign in again.");
    if (res.status === 403) throw new Error("You do not have permission to upload media.");
    throw new Error(data.error || "Upload failed.");
  }
  return data.url;
}

type DeleteResult = { ok: boolean; error?: string };

async function deleteFile(url: string): Promise<DeleteResult> {
  if (!url) return { ok: true };
  try {
    const res = await fetch("/api/admin/media/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || `Could not delete the file (${res.status}).` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error while trying to delete the file." };
  }
}

export default function ThemeEditorForm({
  initial,
  saveEndpoint,
}: {
  initial: ThemeFormValues;
  saveEndpoint: string;
}) {
  const [form, setForm] = useState<ThemeFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  function set<K extends keyof ThemeFormValues>(key: K, value: ThemeFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleUpload(file: File, kind: string, field: keyof ThemeFormValues) {
    setUploading(kind);
    setMessage(null);
    try {
      const oldUrl = form[field] as string;
      const url = await uploadFile(file, kind);
      set(field, url as never);
      // Replacing a file — try to delete the old one from Storage so it
      // doesn't sit there as an orphaned upload forever. The NEW file
      // already uploaded successfully at this point, so a cleanup
      // failure here is a warning, not a reason to discard the new file.
      if (oldUrl) {
        const result = await deleteFile(oldUrl);
        if (!result.ok) {
          setMessage(`Uploaded, but couldn't remove the previous file from Storage: ${result.error}`);
        }
      }
    } catch (e: any) {
      setMessage(e.message);
    }
    setUploading(null);
  }

  async function handleRemove(
    field: "background_image_url" | "background_video_url" | "music_url",
    label: string,
    extraFieldsToDisable: (keyof ThemeFormValues)[] = []
  ) {
    const currentUrl = form[field] as string;
    if (!currentUrl) return;
    if (!confirm(`Remove the current ${label}? This deletes the uploaded file and cannot be undone.`)) return;

    setUploading(`removing-${field}`);
    setMessage(null);
    const result = await deleteFile(currentUrl);
    setUploading(null);

    if (!result.ok) {
      setMessage(`Could not remove ${label}: ${result.error}. The field was left unchanged — try again, or remove the URL manually if you're sure the file is already gone.`);
      return;
    }

    setForm((f) => {
      const next = { ...f, [field]: "" };
      for (const extra of extraFieldsToDisable) (next as any)[extra] = false;
      return next;
    });
    setMessage(`${label} removed. Click "Save Theme" to apply.`);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const res = await fetch(saveEndpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const text = await res.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { data = { error: text || `Save failed (HTTP ${res.status}).` }; }
    setSaving(false);
    if (!res.ok) {
      if (res.status === 401) { setMessage("Session expired, please sign in again."); return; }
      if (res.status === 403) { setMessage("You do not have permission to save this theme."); return; }
      setMessage(data.error || "Save failed.");
      return;
    }
    setMessage("Theme saved.");
  }

  const colorField = (label: string, key: keyof ThemeFormValues) => (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={form[key] as string}
          onChange={(e) => set(key, e.target.value as never)}
          className="w-10 h-10 rounded border"
        />
        <input
          value={form[key] as string}
          onChange={(e) => set(key, e.target.value as never)}
          className="border rounded-lg px-2 py-2 text-sm flex-1"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-navy-900 mb-3">Colors</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {colorField("Background", "background_color")}
          {colorField("Accent", "accent_color")}
          {colorField("Card", "card_color")}
          {colorField("Button", "button_color")}
          {colorField("Text", "text_color")}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-navy-900 mb-3">Background Image</h3>
        <div className="flex gap-2 items-center">
          <input
            placeholder="Image URL"
            value={form.background_image_url}
            onChange={(e) => set("background_image_url", e.target.value)}
            className="border rounded-lg px-3 py-2 flex-1 text-sm"
          />
          <label className="px-3 py-2 bg-gray-100 rounded-lg text-sm cursor-pointer">
            {uploading === "background-image" ? "Uploading..." : "Upload"}
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "background-image", "background_image_url")}
            />
          </label>
          {form.background_image_url && (
            <button
              type="button"
              onClick={() => handleRemove("background_image_url", "background image")}
              disabled={uploading === "removing-background_image_url"}
              className="px-3 py-2 bg-red-50 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-60"
            >
              {uploading === "removing-background_image_url" ? "Removing..." : "Remove image"}
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1">Used only if background video is disabled below. jpg/png/webp, max 10MB.</p>
      </div>

      <div>
        <h3 className="font-semibold text-navy-900 mb-3">Background Video</h3>
        <div className="flex gap-2 items-center mb-2">
          <input
            placeholder="Video URL"
            value={form.background_video_url}
            onChange={(e) => set("background_video_url", e.target.value)}
            className="border rounded-lg px-3 py-2 flex-1 text-sm"
          />
          <label className="px-3 py-2 bg-gray-100 rounded-lg text-sm cursor-pointer">
            {uploading === "background-video" ? "Uploading..." : "Upload"}
            <input
              type="file"
              accept=".mp4,.webm"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "background-video", "background_video_url")}
            />
          </label>
          {form.background_video_url && (
            <button
              type="button"
              onClick={() => handleRemove("background_video_url", "background video", ["background_video_enabled"])}
              disabled={uploading === "removing-background_video_url"}
              className="px-3 py-2 bg-red-50 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-60"
            >
              {uploading === "removing-background_video_url" ? "Removing..." : "Remove video"}
            </button>
          )}
        </div>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.background_video_enabled} onChange={(e) => set("background_video_enabled", e.target.checked)} />
            Enabled
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.background_video_muted} onChange={(e) => set("background_video_muted", e.target.checked)} />
            Muted (recommended — required for reliable autoplay)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.background_video_loop} onChange={(e) => set("background_video_loop", e.target.checked)} />
            Loop
          </label>
        </div>
        <p className="text-xs text-gray-400 mt-1">mp4/webm, max 80MB.</p>
      </div>

      <div>
        <h3 className="font-semibold text-navy-900 mb-3">Music</h3>
        <div className="flex gap-2 items-center mb-2">
          <input
            placeholder="Music URL"
            value={form.music_url}
            onChange={(e) => set("music_url", e.target.value)}
            className="border rounded-lg px-3 py-2 flex-1 text-sm"
          />
          <label className="px-3 py-2 bg-gray-100 rounded-lg text-sm cursor-pointer">
            {uploading === "music" ? "Uploading..." : "Upload"}
            <input
              type="file"
              accept=".mp3,.wav,.ogg"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "music", "music_url")}
            />
          </label>
          {form.music_url && (
            <button
              type="button"
              onClick={() => handleRemove("music_url", "music", ["music_enabled"])}
              disabled={uploading === "removing-music_url"}
              className="px-3 py-2 bg-red-50 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-60"
            >
              {uploading === "removing-music_url" ? "Removing..." : "Remove music"}
            </button>
          )}
        </div>
        <div className="flex gap-4 text-sm mb-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.music_enabled} onChange={(e) => set("music_enabled", e.target.checked)} />
            Enabled
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.music_autoplay} onChange={(e) => set("music_autoplay", e.target.checked)} />
            Autoplay (falls back to "tap to enable sound" if blocked)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.music_loop} onChange={(e) => set("music_loop", e.target.checked)} />
            Loop
          </label>
        </div>
        <label className="block text-xs text-gray-500 mb-1">Volume: {form.music_volume}%</label>
        <input
          type="range"
          min={0}
          max={100}
          value={form.music_volume}
          onChange={(e) => set("music_volume", Number(e.target.value))}
          className="w-48"
        />
        <p className="text-xs text-gray-400 mt-1">
          mp3/wav/ogg, max 25MB. Only use music/video you have rights to — see SETUP.md.
        </p>
      </div>

      {message && <p className="text-sm text-teal-700">{message}</p>}

      <div className="flex gap-3">
        <button onClick={() => setShowPreview((s) => !s)} className="px-5 py-2 rounded-lg border font-semibold text-navy-900">
          {showPreview ? "Hide Preview" : "Preview Theme"}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 rounded-lg font-bold text-navy-900 disabled:opacity-60"
          style={{ backgroundColor: "#00C389" }}
        >
          {saving ? "Saving..." : "Save Theme"}
        </button>
      </div>

      {showPreview && (
        <div
          className="rounded-2xl p-6 shadow-card max-w-sm"
          style={{ backgroundColor: form.background_color, color: form.text_color }}
        >
          <div className="rounded-xl p-4 mb-3" style={{ backgroundColor: form.card_color }}>
            <p className="font-bold mb-2" style={{ color: form.text_color }}>Sample Card</p>
            <p className="text-sm opacity-80" style={{ color: form.text_color }}>
              This is how cards will look with the current colors.
            </p>
          </div>
          <button className="px-4 py-2 rounded-lg font-bold text-navy-900" style={{ backgroundColor: form.button_color }}>
            Sample Button
          </button>
          <p className="text-xs mt-3" style={{ color: form.accent_color }}>Accent color text example</p>
        </div>
      )}
    </div>
  );
}
