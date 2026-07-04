"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";

export default function LoginFormWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const urlError = params.get("error");

  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    urlError === "inactive"
      ? "Your account is blocked. Contact your administrator."
      : urlError === "forbidden"
      ? "You don't have access to that page."
      : null
  );

  useEffect(() => {
    fetch("/api/auth/needs-setup")
      .then((r) => r.json())
      .then((d) => setNeedsSetup(!!d.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  async function handleLogin() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Login failed.");
      return;
    }
    router.push(next || data.redirectTo || "/");
  }

  async function handleFirstAdmin() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/first-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: fullName, username }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Could not create the admin account.");
      return;
    }
    router.push(data.redirectTo || "/admin");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="rounded-2xl shadow-card p-8 w-full max-w-sm" style={{ backgroundColor: "var(--card-color)" }}>
          {needsSetup === null ? (
            <p className="text-sm text-gray-400 text-center py-6">Loading...</p>
          ) : needsSetup ? (
            <>
              <h1 className="text-xl font-bold mb-1" style={{ color: "var(--text-color)" }}>First-Time Setup</h1>
              <p className="text-sm text-gray-500 mb-5">
                No administrator exists yet. Create the first Super Admin account — this screen
                disappears permanently once it's done.
              </p>
              <div className="space-y-3">
                <input
                  placeholder="Your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brandGreen"
                />
                <input
                  placeholder="Choose a username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFirstAdmin()}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brandGreen"
                />
                {error && <p className="text-red-600 text-sm">{error}</p>}
                <button
                  onClick={handleFirstAdmin}
                  disabled={loading}
                  style={{ backgroundColor: "var(--button-color)" }}
                  className="w-full text-navy-900 font-bold py-3 rounded-lg hover:opacity-90 disabled:opacity-60"
                >
                  {loading ? "Creating..." : "Create Admin & Sign In"}
                </button>
                <p className="text-xs text-gray-400">
                  ⚠ Your username is your only credential — there is no password. Pick something not
                  easily guessed, and treat it like one.
                </p>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold mb-1" style={{ color: "var(--text-color)" }}>Sign In</h1>
              <p className="text-sm text-gray-500 mb-5">Unit Function Exam — Operator Training Platform</p>
              <div className="space-y-3">
                <input
                  id="username"
                  name="username"
                  autoComplete="username"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brandGreen"
                />
                {error && <p className="text-red-600 text-sm">{error}</p>}
                <button
                  onClick={handleLogin}
                  disabled={loading}
                  style={{ backgroundColor: "var(--button-color)" }}
                  className="w-full text-navy-900 font-bold py-3 rounded-lg hover:opacity-90 disabled:opacity-60"
                >
                  {loading ? "Signing in..." : "Sign In"}
                </button>
                <p className="text-xs text-gray-400">
                  Enter the username your administrator gave you. No password needed.
                </p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
