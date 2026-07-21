"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

type Link_ = { href: string; label: string };

export default function AdminSidebar() {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/whoami")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRole(d?.profile?.role_id ?? null))
      .catch(() => setRole(null));
  }, []);

  const links: Link_[] = [{ href: "/admin", label: "Dashboard" }];
  if (role === "super_admin" || role === "question_manager") {
    links.push(
      { href: "/admin/questions", label: "Questions" },
      { href: "/admin/categories", label: "Categories & Rules" },
      { href: "/admin/import", label: "Excel Import" },
      { href: "/admin/ai-generator", label: "AI Question Generator" },
      { href: "/admin/topics", label: "AI Topics" },
      { href: "/admin/trainer-questions", label: "Trainer Questions" }
    );
  }
  if (role === "super_admin" || role === "exam_reviewer") {
    links.push({ href: "/admin/results", label: "Results" });
  }
  if (role === "super_admin") {
    links.push(
      { href: "/admin/exam-settings", label: "Exam Settings" },
      { href: "/admin/exam-templates", label: "Same Exam for Many" },
      { href: "/admin/users", label: "Users" },
      { href: "/admin/themes", label: "Themes" },
      { href: "/admin/data", label: "Data Management" },
      { href: "/admin/audit", label: "Audit Log" }
    );
  }

  return (
    <aside className="w-56 flex-shrink-0 hidden md:block">
      <nav className="card p-3 space-y-1 sticky top-4">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={clsx(
              "block px-3 py-2 rounded-lg text-sm font-medium",
              pathname === l.href ? "bg-navy-900 text-white" : "text-navy-800 hover:bg-gray-100"
            )}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
