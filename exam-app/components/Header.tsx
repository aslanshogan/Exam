"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "./Logo";

type Profile = { display_name: string; role_id: string } | null;

export default function Header() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/auth/whoami")
      .then((r) => r.json())
      .then((d) => setProfile(d.profile))
      .finally(() => setLoaded(true));
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const role = profile?.role_id;
  const isAdminArea = role && role !== "trainee";

  return (
    <header className="w-full bg-navy-900 border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <Logo />
        </Link>
        <nav className="flex items-center gap-4 text-sm text-white/80">
          {isAdminArea && (
            <>
              <Link href="/admin" className="hover:text-white">Dashboard</Link>
              {(role === "super_admin" || role === "question_manager") && (
                <>
                  <Link href="/admin/questions" className="hover:text-white">Questions</Link>
                  <Link href="/admin/categories" className="hover:text-white">Categories</Link>
                  <Link href="/admin/import" className="hover:text-white">Import</Link>
                </>
              )}
              {(role === "super_admin" || role === "exam_reviewer") && (
                <Link href="/admin/results" className="hover:text-white">Results</Link>
              )}
              {role === "super_admin" && (
                <>
                  <Link href="/admin/exam-settings" className="hover:text-white">Exam Settings</Link>
                  <Link href="/admin/users" className="hover:text-white">Users</Link>
                  <Link href="/admin/themes" className="hover:text-white">Themes</Link>
                </>
              )}
            </>
          )}
          {loaded && (
            profile ? (
              <span className="flex items-center gap-3 pl-2 border-l border-white/20">
                <span className="text-white/60 hidden sm:inline">{profile.display_name}</span>
                <button onClick={handleLogout} className="text-brandGreen hover:text-brandGreen-600 font-medium">
                  Log Out
                </button>
              </span>
            ) : (
              <Link href="/login" className="hover:text-white">Sign In</Link>
            )
          )}
        </nav>
      </div>
    </header>
  );
}
