"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import AdminSidebar from "@/components/AdminSidebar";

type UserRow = {
  id: string;
  email: string | null;
  display_name: string;
  role_id: string;
  is_active: boolean;
  last_login_at: string | null;
  exam_access: { allowed_to_take: boolean; attempts_used: number; max_attempts: number } | null;
  completed_exams: number;
};

const ROLES = [
  { id: "super_admin", label: "Super Admin" },
  { id: "question_manager", label: "Question Manager" },
  { id: "exam_reviewer", label: "Exam Reviewer" },
  { id: "trainee", label: "Trainee" },
];

const emptyForm = {
  display_name: "",
  email: "",
  password: "",
  access_code: "",
  role_id: "trainee",
  allowed_to_take: true,
  allow_retake: false,
  max_attempts: 1,
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    setUsers(data.users || []);
  }
  useEffect(() => { load(); }, []);

  async function handleCreate() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setForm(emptyForm);
    setShowForm(false);
    load();
  }

  async function toggleActive(u: UserRow) {
    await fetch(`/api/admin/users/${u.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !u.is_active }),
    });
    load();
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-8 w-full flex gap-6">
        <AdminSidebar />
        <div className="flex-1 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-navy-900">Users</h1>
            <button onClick={() => setShowForm((s) => !s)} className="bg-brandGreen text-navy-900 font-bold px-4 py-2 rounded-lg">
              {showForm ? "Cancel" : "+ Add User"}
            </button>
          </div>

          {showForm && (
            <div className="card p-5 space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <input
                  placeholder="Full name"
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  className="border rounded-lg px-3 py-2"
                />
                <select
                  value={form.role_id}
                  onChange={(e) => setForm({ ...form, role_id: e.target.value })}
                  className="border rounded-lg px-3 py-2"
                >
                  {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                <input
                  placeholder="Email (leave blank to use access code instead)"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="border rounded-lg px-3 py-2"
                />
                <input
                  placeholder="Password (required with email)"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="border rounded-lg px-3 py-2"
                />
                <input
                  placeholder="Access code (alternative to email login)"
                  value={form.access_code}
                  onChange={(e) => setForm({ ...form, access_code: e.target.value })}
                  className="border rounded-lg px-3 py-2"
                />
              </div>
              {form.role_id === "trainee" && (
                <div className="flex gap-4 items-center text-sm pt-2 border-t">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.allowed_to_take} onChange={(e) => setForm({ ...form, allowed_to_take: e.target.checked })} />
                    Allowed to take exam
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.allow_retake} onChange={(e) => setForm({ ...form, allow_retake: e.target.checked })} />
                    Allow retake
                  </label>
                  <label className="flex items-center gap-2">
                    Max attempts:
                    <input
                      type="number"
                      min={1}
                      value={form.max_attempts}
                      onChange={(e) => setForm({ ...form, max_attempts: Number(e.target.value) })}
                      className="border rounded px-2 py-1 w-16"
                    />
                  </label>
                </div>
              )}
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button onClick={handleCreate} disabled={saving} className="bg-navy-900 text-white font-bold px-5 py-2 rounded-lg disabled:opacity-60">
                {saving ? "Creating..." : "Create User"}
              </button>
            </div>
          )}

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-navy-900 text-white">
                <tr>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Role</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Last Login</th>
                  <th className="text-left px-4 py-3">Completed Exams</th>
                  <th className="text-left px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-3 font-medium text-navy-900">{u.display_name}</td>
                    <td className="px-4 py-3">{ROLES.find((r) => r.id === u.role_id)?.label}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(u)}
                        className={`px-2 py-1 rounded-full text-xs font-bold ${u.is_active ? "bg-brandGreen/15 text-brandGreen-700" : "bg-red-100 text-red-700"}`}
                      >
                        {u.is_active ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "Never"}</td>
                    <td className="px-4 py-3">{u.completed_exams}</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${u.id}`} className="text-teal-700 hover:underline">Manage</Link>
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
