"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import AdminSidebar from "@/components/AdminSidebar";

type User = {
  id: string;
  full_name: string | null;
  display_name: string;
  username: string | null;
  email: string | null;
  role_id: string;
  is_active: boolean;
  created_at: string | null;
  completed_exams: number;
};

const ROLES = [
  { id: "super_admin", label: "Super Admin" },
  { id: "question_manager", label: "Question Manager" },
  { id: "exam_reviewer", label: "Exam Reviewer" },
  { id: "trainee", label: "Trainee" },
];

const emptyForm = { id: "", full_name: "", username: "", email: "", role_id: "trainee" };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    if (res.ok) {
      setUsers(data.users || []);
      setCurrentUserId(data.currentUserId || null);
    } else {
      setError(data.error || "Could not load users.");
    }
  }
  useEffect(() => { load(); }, []);

  function openAdd() {
    setForm(emptyForm);
    setEditing(false);
    setError(null);
    setShowForm(true);
  }

  function openEdit(u: User) {
    setForm({
      id: u.id,
      full_name: u.full_name || u.display_name || "",
      username: u.username || "",
      email: u.email || "",
      role_id: u.role_id,
    });
    setEditing(true);
    setError(null);
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);

    const payload = {
      full_name: form.full_name,
      username: form.username,
      email: form.email || undefined,
      role_id: form.role_id,
    };

    const res = editing
      ? await fetch(`/api/admin/users/${form.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, is_active: true }),
        });

    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Save failed.");
      return;
    }
    setShowForm(false);
    setMessage(editing ? "User updated." : `User created. They can now log in with the username "${form.username}".`);
    load();
  }

  async function handleBlock(u: User) {
    if (!confirm(`Block ${u.full_name || u.display_name}?\n\nThey will immediately be unable to log in. This is reversible — use Activate to unblock.`)) return;
    setMessage(null);
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Could not block user."); return; }
    setError(null);
    load();
  }

  async function handleActivate(u: User) {
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Could not activate user."); return; }
    setError(null);
    load();
  }

  async function handleDelete(u: User) {
    if (
      !confirm(
        `Delete ${u.full_name || u.display_name} (@${u.username || "no username"})?\n\n` +
          `This blocks their login and hides them from active use. Their exam results are kept. ` +
          `This can be reversed with Activate.\n\n(For a PERMANENT delete, open the user's detail page → Danger Zone.)`
      )
    )
      return;
    setMessage(null);
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Could not delete user."); return; }
    setError(null);
    setMessage("User deleted (soft — reversible with Activate).");
    load();
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8 w-full flex gap-6">
        <AdminSidebar />
        <div className="flex-1 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-navy-900">Users</h1>
            <button onClick={openAdd} className="bg-brandGreen text-navy-900 font-bold px-5 py-2 rounded-lg">
              + Add User
            </button>
          </div>

          <p className="text-sm text-gray-500">
            Login is by <strong>username only</strong> — the username is the credential. Use
            hard-to-guess usernames for admin accounts. Email is optional (informational only).
          </p>

          {message && <p className="text-sm text-teal-700 bg-teal-700/10 rounded-lg px-4 py-2">{message}</p>}
          {error && !showForm && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-4 py-2">{error}</p>}

          {showForm && (
            <div className="card p-5 max-w-xl space-y-3">
              <h2 className="font-semibold text-navy-900">{editing ? "Edit User" : "Add User"}</h2>
              <input
                placeholder="Full name *"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full border rounded-lg px-3 py-2"
              />
              <input
                placeholder="Username * (their login — no spaces, min 3 chars)"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 font-mono"
              />
              <input
                placeholder="Email (optional)"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border rounded-lg px-3 py-2"
              />
              <select
                value={form.role_id}
                onChange={(e) => setForm({ ...form, role_id: e.target.value })}
                className="w-full border rounded-lg px-3 py-2"
              >
                {ROLES.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button onClick={handleSave} disabled={saving} className="bg-brandGreen text-navy-900 font-bold px-5 py-2 rounded-lg disabled:opacity-60">
                  {saving ? "Saving..." : editing ? "Save Changes" : "Create User"}
                </button>
                <button onClick={() => setShowForm(false)} className="px-5 py-2 rounded-lg border">Cancel</button>
              </div>
            </div>
          )}

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy-900 text-white">
                <tr>
                  <th className="text-left px-4 py-3">Full Name</th>
                  <th className="text-left px-4 py-3">Username</th>
                  <th className="text-left px-4 py-3">Email</th>
                  <th className="text-left px-4 py-3">Role</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Created</th>
                  <th className="text-left px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => {
                  const isSelf = u.id === currentUserId;
                  return (
                    <tr key={u.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-3 font-medium text-navy-900">
                        <Link href={`/admin/users/${u.id}`} className="hover:underline">
                          {u.full_name || u.display_name}
                        </Link>
                        {isSelf && <span className="ml-2 text-xs text-gray-400">(you)</span>}
                      </td>
                      <td className="px-4 py-3 font-mono">{u.username || <span className="text-amber-600 text-xs">no username — can't log in</span>}</td>
                      <td className="px-4 py-3 text-gray-500">{u.email || "—"}</td>
                      <td className="px-4 py-3">{ROLES.find((r) => r.id === u.role_id)?.label ?? u.role_id}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${u.is_active ? "bg-brandGreen/15 text-brandGreen-700" : "bg-red-100 text-red-700"}`}>
                          {u.is_active ? "Active" : "Blocked"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</td>
                      <td className="px-4 py-3 space-x-3 whitespace-nowrap">
                        <button onClick={() => openEdit(u)} className="text-teal-700 hover:underline">Edit</button>
                        {u.is_active ? (
                          <button onClick={() => handleBlock(u)} disabled={isSelf} className="text-amber-600 hover:underline disabled:opacity-40 disabled:no-underline" title={isSelf ? "You can't block yourself" : ""}>
                            Block
                          </button>
                        ) : (
                          <button onClick={() => handleActivate(u)} className="text-brandGreen-700 hover:underline">Activate</button>
                        )}
                        <button onClick={() => handleDelete(u)} disabled={isSelf} className="text-red-600 hover:underline disabled:opacity-40 disabled:no-underline" title={isSelf ? "You can't delete yourself" : ""}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr><td className="px-4 py-6 text-center text-gray-400" colSpan={7}>No users yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400">
            Click a user's name for their full detail page (exam access, personal theme, attempt
            history, and permanent deletion). "Delete" here is a soft delete — reversible with
            Activate; exam results are always preserved either way.
          </p>
        </div>
      </main>
    </div>
  );
}
