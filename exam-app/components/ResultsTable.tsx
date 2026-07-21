"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";

export type ResultRow = {
  id: string;
  trainee_name: string;
  started_at: string;
  score_percent: number | null;
  correct_count: number | null;
  wrong_count: number | null;
  pass_fail: "PASS" | "FAIL" | null;
};

export default function ResultsTable({ rows, canDelete = false }: { rows: ResultRow[]; canDelete?: boolean }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(row: ResultRow) {
    if (
      !confirm(
        `Permanently delete the result for "${row.trainee_name}" (${row.started_at ? new Date(row.started_at).toLocaleDateString() : ""})?\n\nThis cannot be undone. Export to CSV first if you might need this record later.`
      )
    ) {
      return;
    }
    setDeletingId(row.id);
    const { ok, error } = await apiFetch(`/api/admin/results/${row.id}`, { method: "DELETE" });
    setDeletingId(null);
    if (!ok) {
      alert(error || "Could not delete this result.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-navy-900 text-white">
          <tr>
            <th className="text-left px-4 py-3">Trainee</th>
            <th className="text-left px-4 py-3">Date</th>
            <th className="text-left px-4 py-3">Score</th>
            <th className="text-left px-4 py-3">Correct</th>
            <th className="text-left px-4 py-3">Wrong</th>
            <th className="text-left px-4 py-3">Result</th>
            <th className="text-left px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              <td className="px-4 py-3 font-medium text-navy-900">{r.trainee_name}</td>
              <td className="px-4 py-3 text-gray-600">{new Date(r.started_at).toLocaleString()}</td>
              <td className="px-4 py-3">{r.score_percent != null ? `${(r.score_percent * 100).toFixed(1)}%` : "—"}</td>
              <td className="px-4 py-3">{r.correct_count ?? "—"}</td>
              <td className="px-4 py-3">{r.wrong_count ?? "—"}</td>
              <td className="px-4 py-3">
                <span
                  className={clsx(
                    "px-2 py-1 rounded-full text-xs font-bold",
                    r.pass_fail === "PASS" ? "bg-brandGreen/15 text-brandGreen-700" : "bg-red-100 text-red-700"
                  )}
                >
                  {r.pass_fail ?? "IN PROGRESS"}
                </span>
              </td>
              <td className="px-4 py-3 space-x-3 whitespace-nowrap">
                <Link href={`/admin/results/${r.id}`} className="text-teal-700 hover:underline">
                  View
                </Link>
                {canDelete && (
                  <button
                    onClick={() => handleDelete(r)}
                    disabled={deletingId === r.id}
                    className="text-red-600 hover:underline disabled:opacity-50"
                  >
                    {deletingId === r.id ? "Deleting..." : "Delete"}
                  </button>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td className="px-4 py-6 text-center text-gray-400" colSpan={7}>No results found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
