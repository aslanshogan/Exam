"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import AdminSidebar from "@/components/AdminSidebar";

type Question = {
  id: string;
  category_id: string;
  question_text: string;
  answer_a: string;
  answer_b: string;
  answer_c: string;
  answer_d: string;
  correct_answer: string;
  explanation: string | null;
  active: boolean;
  always_include: boolean;
  categories?: { name: string };
};

const emptyForm = {
  id: "",
  category_id: "",
  question_text: "",
  answer_a: "",
  answer_b: "",
  answer_c: "",
  answer_d: "",
  correct_answer: "A",
  explanation: "",
  active: true,
  always_include: false,
};

type StatusFilter = "all" | "always_include" | "inactive";

export default function AdminQuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  async function loadCategories() {
    const cRes = await fetch("/api/admin/categories");
    const cData = await cRes.json();
    const cats = (cData.rules || []).map((r: any) => ({ id: r.category_id, name: r.categories?.name }));
    setCategories(cats);
  }

  async function loadQuestions() {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("filter", statusFilter);
    if (categoryFilter) params.set("category_id", categoryFilter);
    const qRes = await fetch(`/api/admin/questions?${params.toString()}`);
    const qData = await qRes.json();
    setQuestions(qData.questions || []);
  }

  useEffect(() => { loadCategories(); }, []);
  useEffect(() => { loadQuestions(); }, [statusFilter, categoryFilter]);

  function startEdit(q: Question) {
    setForm({
      id: q.id,
      category_id: q.category_id,
      question_text: q.question_text,
      answer_a: q.answer_a,
      answer_b: q.answer_b,
      answer_c: q.answer_c,
      answer_d: q.answer_d,
      correct_answer: q.correct_answer,
      explanation: q.explanation || "",
      active: q.active,
      always_include: q.always_include,
    });
    setEditing(true);
  }

  async function handleSave() {
    const method = editing ? "PUT" : "POST";
    const res = await fetch("/api/admin/questions", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm(emptyForm);
      setEditing(false);
      loadQuestions();
    } else {
      const data = await res.json();
      alert(data.error || "Save failed.");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this question? This cannot be undone.")) return;
    const res = await fetch(`/api/admin/questions?id=${id}`, { method: "DELETE" });
    if (res.ok) loadQuestions();
  }

  const filtered = questions.filter((q) =>
    q.question_text.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8 w-full flex gap-6">
        <AdminSidebar />
        <div className="flex-1 space-y-6">
          <h1 className="text-2xl font-bold text-navy-900">Question Bank</h1>

          <div className="card p-5">
            <h2 className="font-semibold text-navy-900 mb-3">{editing ? "Edit Question" : "Add New Question"}</h2>
            <div className="grid md:grid-cols-2 gap-3">
              <select
                className="border rounded-lg px-3 py-2"
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              >
                <option value="">Select category...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                className="border rounded-lg px-3 py-2"
                value={form.correct_answer}
                onChange={(e) => setForm({ ...form, correct_answer: e.target.value })}
              >
                <option value="A">Correct: A</option>
                <option value="B">Correct: B</option>
                <option value="C">Correct: C</option>
                <option value="D">Correct: D</option>
              </select>
              <textarea
                className="border rounded-lg px-3 py-2 md:col-span-2"
                placeholder="Question text"
                value={form.question_text}
                onChange={(e) => setForm({ ...form, question_text: e.target.value })}
              />
              <input className="border rounded-lg px-3 py-2" placeholder="Answer A" value={form.answer_a} onChange={(e) => setForm({ ...form, answer_a: e.target.value })} />
              <input className="border rounded-lg px-3 py-2" placeholder="Answer B" value={form.answer_b} onChange={(e) => setForm({ ...form, answer_b: e.target.value })} />
              <input className="border rounded-lg px-3 py-2" placeholder="Answer C" value={form.answer_c} onChange={(e) => setForm({ ...form, answer_c: e.target.value })} />
              <input className="border rounded-lg px-3 py-2" placeholder="Answer D" value={form.answer_d} onChange={(e) => setForm({ ...form, answer_d: e.target.value })} />
              <textarea
                className="border rounded-lg px-3 py-2 md:col-span-2"
                placeholder="Explanation / notes (optional)"
                value={form.explanation}
                onChange={(e) => setForm({ ...form, explanation: e.target.value })}
              />
            </div>

            <div className="flex gap-6 mt-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.always_include}
                  onChange={(e) => setForm({ ...form, always_include: e.target.checked })}
                />
                Always include in every exam
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                Active question
              </label>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={handleSave} className="bg-brandGreen text-navy-900 font-bold px-5 py-2 rounded-lg hover:bg-brandGreen-600">
                {editing ? "Save Changes" : "Add Question"}
              </button>
              {editing && (
                <button onClick={() => { setForm(emptyForm); setEditing(false); }} className="px-5 py-2 rounded-lg border">
                  Cancel
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <input
              className="border rounded-lg px-3 py-2 flex-1 min-w-[200px]"
              placeholder="Search questions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="border rounded-lg px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">All Questions</option>
              <option value="always_include">Always Included Questions</option>
              <option value="inactive">Inactive Questions</option>
            </select>
            <select
              className="border rounded-lg px-3 py-2 text-sm"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-navy-900 text-white">
                <tr>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-left px-4 py-3">Question</th>
                  <th className="text-left px-4 py-3">Correct</th>
                  <th className="text-left px-4 py-3">Flags</th>
                  <th className="text-left px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((q, i) => (
                  <tr key={q.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-3">{q.categories?.name}</td>
                    <td className="px-4 py-3 max-w-md truncate">{q.question_text}</td>
                    <td className="px-4 py-3">{q.correct_answer}</td>
                    <td className="px-4 py-3 space-x-1">
                      {q.always_include && (
                        <span className="px-2 py-1 rounded-full text-xs font-bold bg-teal-700/10 text-teal-700">Pinned</span>
                      )}
                      {!q.active && (
                        <span className="px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">Inactive</span>
                      )}
                      {q.active && !q.always_include && (
                        <span className="px-2 py-1 rounded-full text-xs font-bold bg-brandGreen/15 text-brandGreen-700">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3 space-x-3">
                      <button onClick={() => startEdit(q)} className="text-teal-700 hover:underline">Edit</button>
                      <button onClick={() => handleDelete(q.id)} className="text-red-600 hover:underline">Delete</button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td className="px-4 py-6 text-center text-gray-400" colSpan={5}>No questions match this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
