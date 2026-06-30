"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import AdminSidebar from "@/components/AdminSidebar";
import ThemeEditorForm, { DEFAULT_THEME_FORM, ThemeFormValues } from "@/components/ThemeEditorForm";

const ROLES = [
  { id: "super_admin", label: "Super Admin" },
  { id: "question_manager", label: "Question Manager" },
  { id: "exam_reviewer", label: "Exam Reviewer" },
  { id: "trainee", label: "Trainee" },
];

export default function AdminUserDetailPageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading...</div>}>
      <AdminUserDetailPage />
    </Suspense>
  );
}

function AdminUserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as "profile" | "access" | "theme" | "attempts") || "profile";
  const [tab, setTab] = useState<"profile" | "access" | "theme" | "attempts">(initialTab);
  const [data, setData] = useState<any>(null);
  const [profileForm, setProfileForm] = useState({ display_name: "", role_id: "trainee", is_active: true, new_password: "" });
  const [accessForm, setAccessForm] = useState({ allowed_to_take: true, allow_retake: false, max_attempts: 1, access_code: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    const res = await fetch(`/api/admin/users/${userId}`);
    const d = await res.json();
    setData(d);
    if (d.profile) {
      setProfileForm({ display_name: d.profile.display_name, role_id: d.profile.role_id, is_active: d.profile.is_active, new_password: "" });
    }
    if (d.exam_access) {
      setAccessForm({
        allowed_to_take: d.exam_access.allowed_to_take,
        allow_retake: d.exam_access.allow_retake,
        max_attempts: d.exam_access.max_attempts,
        access_code: d.exam_access.access_code || "",
      });
    }
  }
  useEffect(() => { if (userId) load(); }, [userId]);

  async function saveProfile() {
    setSaving(true);
    setMessage(null);
    const body: Record<string, unknown> = {
      display_name: profileForm.display_name,
      role_id: profileForm.role_id,
      is_active: profileForm.is_active,
    };
    if (profileForm.new_password) body.new_password = profileForm.new_password;
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setSaving(false);
    setMessage(res.ok ? "Saved." : d.error);
    setProfileForm((f) => ({ ...f, new_password: "" }));
    load();
  }

  async function saveAccess() {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(accessForm),
    });
    const d = await res.json();
    setSaving(false);
    setMessage(res.ok ? "Saved." : d.error);
    load();
  }

  async function handleQuickDeactivate() {
    if (!confirm(`Deactivate ${data.profile.display_name}? They'll immediately be unable to log in or take the exam. This can be reversed any time by checking "Active" again.`)) {
      return;
    }
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    });
    setSaving(false);
    setMessage(res.ok ? "Deactivated." : (await res.json()).error);
    load();
  }

  async function handleDelete() {
    const attemptCount = data.attempts?.length ?? 0;
    const warning =
      `This permanently deletes ${data.profile.display_name}'s login, access code, theme, and exam-access settings.\n\n` +
      (attemptCount > 0
        ? `They have ${attemptCount} exam attempt(s) on record — those results are NOT deleted and will still show under the name "${data.profile.display_name}" on the Results pages, but will no longer be linked to an active account.\n\n`
        : "They have no exam attempts on record.\n\n") +
      `Consider "Deactivate" instead (reversible) unless you specifically need this account gone.\n\n` +
      `Type DELETE USER exactly to confirm:`;
    const typed = prompt(warning);
    if (typed !== "DELETE USER") {
      if (typed !== null) setMessage("Confirmation text didn't match — user was not deleted.");
      return;
    }

    setDeleting(true);
    setMessage(null);
    const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const d = await res.json();
      setMessage(d.error || "Could not delete this user.");
      return;
    }
    router.push("/admin/users");
  }

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 p-8 text-center text-gray-500">Loading...</main>
      </div>
    );
  }

  const themeInitial: ThemeFormValues = data.theme
    ? {
        background_color: data.theme.background_color,
        accent_color: data.theme.accent_color,
        card_color: data.theme.card_color,
        button_color: data.theme.button_color,
        text_color: data.theme.text_color,
        background_image_url: data.theme.background_image_url || "",
        background_video_url: data.theme.background_video_url || "",
        background_video_enabled: data.theme.background_video_enabled,
        background_video_muted: data.theme.background_video_muted,
        background_video_loop: data.theme.background_video_loop,
        music_url: data.theme.music_url || "",
        music_enabled: data.theme.music_enabled,
        music_autoplay: data.theme.music_autoplay,
        music_loop: data.theme.music_loop,
        music_volume: data.theme.music_volume,
      }
    : DEFAULT_THEME_FORM;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 w-full flex gap-6">
        <AdminSidebar />
        <div className="flex-1 space-y-6">
          <h1 className="text-2xl font-bold text-navy-900">{data.profile.display_name}</h1>

          <div className="flex gap-2 text-sm">
            {(["profile", "access", "theme", "attempts"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-lg font-semibold capitalize ${tab === t ? "bg-navy-900 text-white" : "bg-gray-100 text-navy-800"}`}
              >
                {t === "access" ? "Exam Access" : t === "theme" ? "Theme & Media" : t}
              </button>
            ))}
          </div>

          {message && <p className="text-sm text-teal-700">{message}</p>}

          {tab === "profile" && (
            <div className="card p-5 space-y-3 max-w-md">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Display Name</label>
                <input
                  value={profileForm.display_name}
                  onChange={(e) => setProfileForm({ ...profileForm, display_name: e.target.value })}
                  className="border rounded-lg px-3 py-2 w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Role</label>
                <select
                  value={profileForm.role_id}
                  onChange={(e) => setProfileForm({ ...profileForm, role_id: e.target.value })}
                  className="border rounded-lg px-3 py-2 w-full"
                >
                  {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={profileForm.is_active} onChange={(e) => setProfileForm({ ...profileForm, is_active: e.target.checked })} />
                Active (inactive users cannot log in or take the exam)
              </label>
              {data.profile.auth_user_id && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Reset Password</label>
                  <input
                    type="password"
                    placeholder="New password"
                    value={profileForm.new_password}
                    onChange={(e) => setProfileForm({ ...profileForm, new_password: e.target.value })}
                    className="border rounded-lg px-3 py-2 w-full"
                  />
                </div>
              )}
              <button onClick={saveProfile} disabled={saving} className="bg-brandGreen text-navy-900 font-bold px-5 py-2 rounded-lg disabled:opacity-60">
                {saving ? "Saving..." : "Save"}
              </button>

              <div className="pt-5 mt-5 border-t border-red-200 space-y-3">
                <h3 className="font-semibold text-red-700">Danger Zone</h3>
                <p className="text-xs text-gray-500">
                  {data.profile.is_active
                    ? `${data.profile.display_name} has ${data.attempts?.length ?? 0} exam attempt(s) on record.`
                    : "This account is currently inactive."}
                </p>
                <div className="flex flex-wrap gap-3">
                  {data.profile.is_active && (
                    <button
                      onClick={handleQuickDeactivate}
                      disabled={saving}
                      className="px-4 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 font-semibold text-sm hover:bg-amber-100 disabled:opacity-60"
                      title="Reversible — blocks login and exam access without deleting anything"
                    >
                      Deactivate User
                    </button>
                  )}
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-4 py-2 rounded-lg bg-red-600 text-white font-semibold text-sm hover:bg-red-700 disabled:opacity-60"
                    title="Permanent — removes login, theme, and access settings. Exam results remain under their name."
                  >
                    {deleting ? "Deleting..." : "Delete User"}
                  </button>
                </div>
                <p className="text-xs text-gray-400">
                  <strong>Deactivate</strong> is reversible and recommended for normal use (someone leaving the
                  program, a mistaken account, etc.). <strong>Delete</strong> is permanent — it removes their
                  login and personal settings, but their exam history is preserved (saved under their name as
                  it was at the time) and stays visible on the Results pages.
                </p>
              </div>
            </div>
          )}

          {tab === "access" && (
            <div className="card p-5 space-y-3 max-w-md">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={accessForm.allowed_to_take} onChange={(e) => setAccessForm({ ...accessForm, allowed_to_take: e.target.checked })} />
                Allowed to take the exam
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={accessForm.allow_retake} onChange={(e) => setAccessForm({ ...accessForm, allow_retake: e.target.checked })} />
                Allow retake (ignore attempt limit below)
              </label>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Max Attempts</label>
                <input
                  type="number"
                  min={1}
                  value={accessForm.max_attempts}
                  onChange={(e) => setAccessForm({ ...accessForm, max_attempts: Number(e.target.value) })}
                  className="border rounded-lg px-3 py-2 w-24"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Access Code</label>
                <input
                  value={accessForm.access_code}
                  onChange={(e) => setAccessForm({ ...accessForm, access_code: e.target.value })}
                  className="border rounded-lg px-3 py-2 w-full font-mono"
                  placeholder="optional code-based login"
                />
              </div>
              <p className="text-xs text-gray-400">
                Attempts used so far: {data.exam_access?.attempts_used ?? 0}
              </p>
              <button onClick={saveAccess} disabled={saving} className="bg-brandGreen text-navy-900 font-bold px-5 py-2 rounded-lg disabled:opacity-60">
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          )}

          {tab === "theme" && (
            <div className="card p-5">
              <ThemeEditorForm initial={themeInitial} saveEndpoint={`/api/admin/users/${userId}/theme`} />
            </div>
          )}

          {tab === "attempts" && (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-navy-900 text-white">
                  <tr>
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-4 py-3">Score</th>
                    <th className="text-left px-4 py-3">Result</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.attempts.map((a: any, i: number) => (
                    <tr key={a.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-3">{new Date(a.started_at).toLocaleString()}</td>
                      <td className="px-4 py-3">{a.score_percent != null ? `${(a.score_percent * 100).toFixed(1)}%` : "—"}</td>
                      <td className="px-4 py-3">{a.pass_fail ?? "—"}</td>
                      <td className="px-4 py-3">{a.status}</td>
                      <td className="px-4 py-3">
                        <a href={`/admin/results/${a.id}`} className="text-teal-700 hover:underline">View</a>
                      </td>
                    </tr>
                  ))}
                  {data.attempts.length === 0 && (
                    <tr><td className="px-4 py-6 text-center text-gray-400" colSpan={5}>No exam attempts yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
