import clsx from "clsx";

export type CategoryStatusRow = {
  category_id: string;
  name: string;
  available: number;
  needed: number;
};

export default function CategoryStatusTable({ rows }: { rows: CategoryStatusRow[] }) {
  const anyProblem = rows.some((r) => r.available < r.needed);
  return (
    <div className="card overflow-hidden">
      {anyProblem && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-sm px-4 py-2">
          ⚠ One or more categories don't have enough questions yet — a full 50-question exam
          cannot be generated until every category is fixed.
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="bg-navy-900 text-white">
          <tr>
            <th className="text-left px-4 py-3">Category</th>
            <th className="text-left px-4 py-3">Available</th>
            <th className="text-left px-4 py-3">Needed</th>
            <th className="text-left px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const ok = r.available >= r.needed;
            return (
              <tr key={r.category_id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="px-4 py-3 font-medium text-navy-900">{r.name}</td>
                <td className="px-4 py-3">{r.available}</td>
                <td className="px-4 py-3">{r.needed}</td>
                <td className="px-4 py-3">
                  <span
                    className={clsx(
                      "px-2 py-1 rounded-full text-xs font-bold",
                      ok ? "bg-brandGreen/15 text-brandGreen-700" : "bg-red-100 text-red-700"
                    )}
                  >
                    {ok ? "OK" : "NOT ENOUGH"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
