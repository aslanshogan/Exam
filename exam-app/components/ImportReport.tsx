export type ImportReportData = {
  totalParsed: number;
  totalValid: number;
  totalImported: number;
  duplicatesSkipped?: number;
  replacedExisting?: boolean;
  deletedCount?: number;
  categoriesFound: string[];
  problems: string[];
};

export default function ImportReport({ report }: { report: ImportReportData }) {
  return (
    <div className="space-y-4">
      {report.replacedExisting && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          🗑 Replace mode: deleted <strong>{report.deletedCount ?? 0}</strong> existing question(s) before this import.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-xs text-gray-500 uppercase">Parsed</div>
          <div className="text-2xl font-bold text-navy-900">{report.totalParsed}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500 uppercase">Valid</div>
          <div className="text-2xl font-bold text-teal-700">{report.totalValid}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500 uppercase">Imported</div>
          <div className="text-2xl font-bold text-brandGreen">{report.totalImported}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500 uppercase">Duplicates Skipped</div>
          <div className="text-2xl font-bold text-amber-600">{report.duplicatesSkipped ?? 0}</div>
        </div>
      </div>

      <div className="card p-4">
        <div className="font-semibold mb-2 text-navy-900">Categories found ({report.categoriesFound.length})</div>
        <div className="flex flex-wrap gap-2">
          {report.categoriesFound.map((c) => (
            <span key={c} className="px-2 py-1 bg-gray-100 rounded text-xs">{c}</span>
          ))}
        </div>
      </div>

      {report.problems.length > 0 && (
        <div className="card p-4 border border-red-200">
          <div className="font-semibold mb-2 text-red-700">
            Problems &amp; skipped rows ({report.problems.length}) — review, fix in your source file if needed, then re-import
          </div>
          <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1 max-h-80 overflow-y-auto">
            {report.problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
