"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";

export default function LoginFormWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next");
  const urlError = params.get("error");

  // needsSetup drives the DEFAULT view, but the user can always override
  // it with the manual toggle below, so they're never trapped.
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"login" | "setup" | null>(null);
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
      .then((d) => {
        setNeedsSetup(!!d.needsSetup);
        // Only auto-pick the mode the first time; respect manual switches after.
        setMode((m) => m ?? (d.needsSetup ? "setup" : "login"));
        if (d.error) setError(null); // don't surface the internal check error to the user
      })
      .catch(() => {
        setNeedsSetup(false);
        setMode((m) => m ?? "login");
      });
  }, []);

  async function safeJson(res: Response): Promise<any> {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { error: text || `Request failed (HTTP ${res.status})` };
    }
  }

  async function handleLogin() {
    if (!username.trim()) {
      setError("Please enter your username.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setLoading(false);
        setError(data.error || `Login failed (HTTP ${res.status}).`);
        return;
      }
      // Full reload so the HTTP-only cookie is present for server pages + middleware.
      window.location.href = next || data.redirectTo || "/";
    } catch (e: any) {
      setLoading(false);
      setError(e?.message || "Network error — please try again.");
    }
  }

  async function handleFirstAdmin() {
    if (!fullName.trim() || !username.trim()) {
      setError("Both full name and username are required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/first-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName, username }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setLoading(false);
        setError(data.error || `Setup failed (HTTP ${res.status}).`);
        // If setup is already done or the name is taken, nudge to login mode.
        if (res.status === 403 || res.status === 409) setMode("login");
        return;
      }
      window.location.href = data.redirectTo || "/admin";
    } catch (e: any) {
      setLoading(false);
      setError(e?.message || "Network error — please try again.");
    }
  }

  const showSetup = mode === "setup";

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="rounded-2xl shadow-card p-8 w-full max-w-sm" style={{ backgroundColor: "var(--card-color)" }}>
          {mode === null ? (
            <p className="text-sm text-gray-400 text-center py-6">Loading...</p>
          ) : showSetup ? (
            <>
              <h1 className="text-xl font-bold mb-1" style={{ color: "var(--text-color)" }}>First-Time Setup</h1>
              <p className="text-sm text-gray-500 mb-5">
                {needsSetup
                  ? "No administrator exists yet. Create the first Super Admin account — this screen disappears once it's done."
                  : "Create a Super Admin account. (If setup is already complete, use normal Sign In instead.)"}
              </p>
              <div className="space-y-3">
                <input
                  id="fullName"
                  name="fullName"
                  autoComplete="name"
                  placeholder="Your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brandGreen"
                />
                <input
                  id="setupUsername"
                  name="username"
                  autoComplete="username"
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
                  easily guessed.
                </p>
                <button
                  onClick={() => { setError(null); setMode("login"); }}
                  className="w-full text-sm text-teal-700 hover:underline pt-1"
                >
                  Already have a username? Sign in instead
                </button>
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
                <button
                  onClick={() => { setError(null); setMode("setup"); }}
                  className="w-full text-sm text-teal-700 hover:underline pt-1"
                >
                  First-time setup
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
