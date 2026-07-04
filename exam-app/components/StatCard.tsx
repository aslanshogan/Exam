export default function StatCard({
  label,
  value,
  accent = "navy",
}: {
  label: string;
  value: string | number;
  accent?: "navy" | "green" | "teal";
}) {
  const accentColor =
    accent === "green" ? "text-brandGreen" : accent === "teal" ? "text-teal-700" : "text-navy-900";
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">{label}</div>
      <div className={`text-3xl font-bold ${accentColor}`}>{value}</div>
    </div>
  );
}
