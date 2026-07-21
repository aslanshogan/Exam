"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import AdminSidebar from "@/components/AdminSidebar";
import { apiFetch } from "@/lib/apiFetch";

type Topic = { id: string; group_name: string; topic: string; sort_order: number; active: boolean };

export default function TopicsAdminPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const { ok, data, error } = await apiFetch("/api/admin/topics");
    setLoading(false);
    if (!ok || !data) { setError(error || "Could not load topics."); return; }
    setTopics(data.topics || []);
  }
  useEffect(() => { load(); }, []);

  // Group the flat list into ordered groups for display.
  const groups: { name: string; items: Topic[] }[] = [];
  for (const t of topics) {
    let g = groups.find((x) => x.name === t.group_name);
    if (!g) { g = { name: t.group_name, items: [] }; groups.push(g); }
    g.items.push(t);
  }
  const groupNames = groups.map((g) => g.name);

  async function seedFromBuiltin() {
    setBusy(true); setError(null); setMessage(null);
    const { ok, data, error } = await apiFetch("/api/admin/topics", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "seed" }),
    });
    setBusy(false);
    if (!ok || !data) { setError(error || "Seed failed."); return; }
    setMessage(data.seeded > 0 ? `Loaded ${data.seeded} starter topics (and created ${data.categoriesCreated ?? 0} matching bank categories).` : (data.message || "Topics already exist."));
    load();
  }

  async function addTopic() {
    if (!newTopic.trim()) { setError("Enter a topic name."); return; }
    setBusy(true); setError(null); setMessage(null);
    const { ok, data, error } = await apiFetch("/api/admin/topics", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_name: newGroup.trim() || "General", topic: newTopic.trim() }),
    });
    setBusy(false);
    if (!ok) { setError(error || "Add failed."); return; }
    setMessage(data?.categoryCreated ? `Added "${newTopic.trim()}" and created a matching bank category.` : `Added "${newTopic.trim()}".`);
    setNewTopic("");
    load();
  }

  async function updateTopic(id: string, patch: Partial<Topic>) {
    const { ok, error } = await apiFetch("/api/admin/topics", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id, ...patch }),
    });
    if (!ok) setError(error || "Update failed.");
  }

  async function removeTopic(id: string) {
    if (!confirm("Delete this topic?")) return;
    const { ok, error } = await apiFetch(`/api/admin/topics?id=${id}`, { method: "DELETE" });
    if (!ok) { setError(error || "Delete failed."); return; }
    setTopics((ts) => ts.filter((t) => t.id !== id));
  }

  // Persist the whole current order/grouping.
  async function saveOrder(next: Topic[]) {
    setTopics(next);
    const order = next.map((t, i) => ({ id: t.id, group_name: t.group_name, sort_order: i }));
    await apiFetch("/api/admin/topics", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reorder", order }),
    });
  }

  function move(id: string, dir: -1 | 1) {
    const idx = topics.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= topics.length) return;
    const next = [...topics];
    [next[idx], next[target]] = [next[target], next[idx]];
    saveOrder(next);
  }

  function renameGroup(oldName: string) {
    const nn = prompt(`Rename group "${oldName}" to:`, oldName);
    if (!nn || !nn.trim() || nn.trim() === oldName) return;
    const next = topics.map((t) => (t.group_name === oldName ? { ...t, group_name: nn.trim() } : t));
    saveOrder(next);
  }

  function moveToGroup(id: string) {
    const options = groupNames.join(", ");
    const g = prompt(`Move to which group? Existing: ${options}\n(or type a new group name)`);
    if (!g || !g.trim()) return;
    const next = topics.map((t) => (t.id === id ? { ...t, group_name: g.trim() } : t));
    // Re-cluster so same-group items sit together, then persist.
    const clustered: Topic[] = [];
    for (const gn of Array.from(new Set(next.map((t) => t.group_name)))) {
      for (const t of next.filter((x) => x.group_name === gn)) clustered.push(t);
    }
    saveOrder(clustered);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 flex gap-8">
        <AdminSidebar />
        <div className="flex-1 space-y-6">
          <h1 className="text-2xl font-bold text-navy-900">AI Topics</h1>
          <p className="text-sm text-gray-500 -mt-4">
            Manage the topic list used by the AI Knowledge Trainer and the AI Question Generator. Add, rename,
            delete, reorder, and group topics however you like. Trainees never see these as your exam categories —
            they're only the AI topic choices. Adding a topic also creates a matching bank category automatically, so generated questions have somewhere to live.
          </p>

          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}
          {message && <p className="text-sm text-teal-800 bg-teal-700/10 border border-teal-700/20 rounded-lg px-4 py-2">{message}</p>}

          {/* Add new */}
          <div className="card p-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Group</label>
              <input
                list="group-suggestions"
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                placeholder="e.g. Hydro & Turbines"
                className="border rounded-lg px-3 py-2 text-sm w-56"
              />
              <datalist id="group-suggestions">
                {groupNames.map((g) => <option key={g} value={g} />)}
              </datalist>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-500 mb-1">New topic</label>
              <input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="e.g. Kaplan Turbine Blades"
                className="border rounded-lg px-3 py-2 text-sm w-full" onKeyDown={(e) => { if (e.key === "Enter") addTopic(); }} />
            </div>
            <button onClick={addTopic} disabled={busy} className="bg-navy-900 text-white font-bold px-4 py-2 rounded-lg disabled:opacity-60">
              + Add topic
            </button>
          </div>

          {loading ? (
            <div className="card p-8 text-center text-gray-500">Loading…</div>
          ) : topics.length === 0 ? (
            <div className="card p-8 text-center space-y-3">
              <p className="text-gray-500">No topics yet.</p>
              <button onClick={seedFromBuiltin} disabled={busy} className="bg-brandGreen text-navy-900 font-bold px-4 py-2 rounded-lg disabled:opacity-60">
                Load starter topics
              </button>
              <p className="text-xs text-gray-400">Loads the built-in list (hydro, generator, electrical, I&amp;C, fire fighting, etc.) so you can edit from there.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {groups.map((g) => (
                <div key={g.name} className="card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-bold text-navy-900">{g.name}</h2>
                    <button onClick={() => renameGroup(g.name)} className="text-xs text-teal-700 hover:underline">Rename group</button>
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {g.items.map((t) => (
                      <li key={t.id} className="py-2 flex items-center gap-2">
                        <div className="flex flex-col">
                          <button onClick={() => move(t.id, -1)} className="text-gray-400 hover:text-navy-900 leading-none" title="Move up">▲</button>
                          <button onClick={() => move(t.id, 1)} className="text-gray-400 hover:text-navy-900 leading-none" title="Move down">▼</button>
                        </div>
                        <input
                          defaultValue={t.topic}
                          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.topic) updateTopic(t.id, { topic: v }); }}
                          className={"flex-1 border border-transparent hover:border-gray-200 focus:border-gray-300 rounded px-2 py-1 text-sm " + (t.active ? "" : "line-through text-gray-400")}
                        />
                        <button onClick={() => moveToGroup(t.id)} className="text-xs text-gray-500 hover:underline">move</button>
                        <button
                          onClick={() => { updateTopic(t.id, { active: !t.active }); setTopics((ts) => ts.map((x) => x.id === t.id ? { ...x, active: !x.active } : x)); }}
                          className="text-xs text-gray-500 hover:underline"
                          title={t.active ? "Hide from dropdowns" : "Show in dropdowns"}
                        >
                          {t.active ? "hide" : "show"}
                        </button>
                        <button onClick={() => removeTopic(t.id)} className="text-xs text-red-600 hover:underline">delete</button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
