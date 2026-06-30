"use client";

import { useEffect, useState, Fragment } from "react";
import Header from "@/components/Header";
import AdminSidebar from "@/components/AdminSidebar";

type Template = {
  id: string;
  name: string;
  shuffle_order_per_trainee: boolean;
  created_at: string;
  questionCount: number;
  assignedCount: number;
};

type Trainee = {
  id: string;
  display_name: string;
  role_id: string;
  exam_access: { assigned_template_id: string | null } | null;
};

export default function AdminExamTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [newName, setNewName] = useState("");
  const [shuffleNew, setShuffleNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [openAssignFor, setOpenAssignFor] = useState<string | null>(null);
  const [selectedTrainees, setSelectedTrainees] = useState<Set<string>>(new Set());

  async function load() {
    const [tRes, uRes] = await Promise.all([
      fetch("/api/admin/exam-templates"),
      fetch("/api/admin/users"),
    ]);
    const tData = await tRes.json();
    const uData = await uRes.json();
    setTemplates(tData.templates || []);
    setTrainees((uData.users || []).filter((u: any) => u.role_id === "trainee"));
  }
  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setMessage(null);
    const res = await fetch("/api/admin/exam-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), shuffle_order_per_trainee: shuffleNew }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      setMessage(data.error || "Could not create exam template.");
      return;
    }
    setNewName("");
    setShuffleNew(false);
    setMessage(`Created — ${data.questionCount} questions. Now assign it to trainees below.`);
    load();
  }

  function openAssign(templateId: string) {
    setOpenAssignFor(templateId);
    const preSelected = new Set(
      trainees.filter((t) => t.exam_access?.assigned_template_id === templateId).map((t) => t.id)
    );
    setSelectedTrainees(preSelected);
  }

  function toggleTrainee(id: string) {
    setSelectedTrainees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveAssignment(templateId: string) {
    const allTraineeIds = trainees.map((t) => t.id);
    const toAssign = Array.from(selectedTrainees);
    const toUnassign = allTraineeIds.filter((id) => !selectedTrainees.has(id) && trainees.find((t) => t.id === id)?.exam_access?.assigned_template_id === templateId);

    setMessage(null);
    if (toAssign.length > 0) {
      await fetch(`/api/admin/exam-templates/${templateId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: toAssign, action: "assign" }),
      });
    }
    if (toUnassign.length > 0) {
      await fetch(`/api/admin/exam-templates/${templateId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: toUnassign, action: "unassign" }),
      });
    }
    setMessage(`Assigned to ${toAssign.length} trainee(s).`);
    setOpenAssignFor(null);
    load();
  }

  async function handleDelete(templateId: string, name: string) {
    if (!confirm(`Delete the exam template "${name}"? Any trainee currently assigned to it will fall back to a normal random exam instead. This cannot be undone.`)) return;
    await fetch(`/api/admin/exam-templates/${templateId}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 w-full flex gap-6">
        <AdminSidebar />
        <div className="flex-1 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-navy-900">Same Exam for Multiple Trainees</h1>
            <p className="text-sm text-gray-500 mt-1">
              Generate one fixed question set, then assign it to as many trainees as you like — they'll
              all get the exact same questions (and, optionally, the same order) the next time they
              click Start Exam. Trainees with no assignment keep getting a fresh random exam as usual.
            </p>
          </div>

          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-navy-900">Create New Shared Exam</h2>
            <div className="flex flex-wrap gap-3 items-end">
              <input
                placeholder="e.g. March Cohort Exam"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="border rounded-lg px-3 py-2 flex-1 min-w-[200px]"
              />
              <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                <input type="checkbox" checked={shuffleNew} onChange={(e) => setShuffleNew(e.target.checked)} />
                Shuffle order per trainee
              </label>
              <button onClick={handleCreate} disabled={creating} className="bg-brandGreen text-navy-900 font-bold px-5 py-2 rounded-lg disabled:opacity-60">
                {creating ? "Generating..." : "Generate"}
              </button>
            </div>
            <p className="text-xs text-gray-400">
              Uses your current Exam Settings (always-include questions, total size, selection mode)
              to generate this one set right now. The questions are locked in permanently — editing or
              deleting them later in the question bank won't change this template.
            </p>
            {message && <p className="text-sm text-teal-700">{message}</p>}
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-navy-900 text-white">
                <tr>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Questions</th>
                  <th className="text-left px-4 py-3">Assigned To</th>
                  <th className="text-left px-4 py-3">Created</th>
                  <th className="text-left px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t, i) => (
                  <Fragment key={t.id}>
                    <tr className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-3 font-medium text-navy-900">
                        {t.name}
                        {t.shuffle_order_per_trainee && <span className="ml-2 text-xs text-gray-400">(shuffled order)</span>}
                      </td>
                      <td className="px-4 py-3">{t.questionCount}</td>
                      <td className="px-4 py-3">{t.assignedCount} trainee(s)</td>
                      <td className="px-4 py-3 text-gray-500">{new Date(t.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 space-x-3 whitespace-nowrap">
                        <button onClick={() => openAssign(t.id)} className="text-teal-700 hover:underline">
                          {openAssignFor === t.id ? "Close" : "Assign"}
                        </button>
                        <button onClick={() => handleDelete(t.id, t.name)} className="text-red-600 hover:underline">
                          Delete
                        </button>
                      </td>
                    </tr>
                    {openAssignFor === t.id && (
                      <tr>
                        <td colSpan={5} className="px-4 py-4 bg-gray-50 border-t">
                          {trainees.length === 0 ? (
                            <p className="text-sm text-gray-400">No trainee accounts exist yet — add some on the Users page first.</p>
                          ) : (
                            <>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3 max-h-60 overflow-y-auto">
                                {trainees.map((tr) => (
                                  <label key={tr.id} className="flex items-center gap-2 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={selectedTrainees.has(tr.id)}
                                      onChange={() => toggleTrainee(tr.id)}
                                    />
                                    {tr.display_name}
                                    {tr.exam_access?.assigned_template_id && tr.exam_access.assigned_template_id !== t.id && (
                                      <span className="text-xs text-amber-600">(has another template)</span>
                                    )}
                                  </label>
                                ))}
                              </div>
                              <button onClick={() => saveAssignment(t.id)} className="bg-navy-900 text-white text-sm font-semibold px-4 py-2 rounded-lg">
                                Save Assignment
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {templates.length === 0 && (
                  <tr><td className="px-4 py-6 text-center text-gray-400" colSpan={5}>No shared exams created yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
