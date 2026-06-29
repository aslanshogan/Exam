"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import { supabaseBrowser } from "@/lib/supabaseClient";

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

  const [mode, setMode] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    urlError === "inactive"
      ? "Your account is inactive. Contact your administrator."
      : urlError === "forbidden"
      ? "You don't have access to that page."
      : null
  );

  async function handlePasswordLogin() {
    setLoading(true);
    setError(null);
    const { error: signInError } = await supabaseBrowser.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError("Incorrect email or password.");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/auth/post-login", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Login failed.");
      setLoading(false);
      return;
    }
    router.push(next || data.redirectTo || "/");
  }

  async function handleCodeLogin() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/access-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Invalid code.");
      setLoading(false);
      return;
    }
    router.push(next || data.redirectTo || "/");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="rounded-2xl shadow-card p-8 w-full max-w-sm" style={{ backgroundColor: "var(--card-color)" }}>
          <h1 className="text-xl font-bold mb-1" style={{ color: "var(--text-color)" }}>Sign In</h1>
          <p className="text-sm text-gray-500 mb-5">Unit Function Exam — Operator Training Platform</p>

          <div className="flex gap-2 mb-5 text-sm">
            <button
              onClick={() => setMode("password")}
              style={mode === "password" ? { backgroundColor: "var(--accent-color)", color: "#fff" } : undefined}
              className={`flex-1 py-2 rounded-lg font-semibold ${mode === "password" ? "" : "bg-gray-100 text-navy-800"}`}
            >
              Email &amp; Password
            </button>
            <button
              onClick={() => setMode("code")}
              style={mode === "code" ? { backgroundColor: "var(--accent-color)", color: "#fff" } : undefined}
              className={`flex-1 py-2 rounded-lg font-semibold ${mode === "code" ? "" : "bg-gray-100 text-navy-800"}`}
            >
              Access Code
            </button>
          </div>

          {mode === "password" ? (
            <div className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brandGreen"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePasswordLogin()}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brandGreen"
              />
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button
                onClick={handlePasswordLogin}
                disabled={loading}
                style={{ backgroundColor: "var(--button-color)" }}
                className="w-full text-navy-900 font-bold py-3 rounded-lg hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                placeholder="Access code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCodeLogin()}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brandGreen tracking-widest text-center font-mono"
              />
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button
                onClick={handleCodeLogin}
                disabled={loading}
                style={{ backgroundColor: "var(--button-color)" }}
                className="w-full text-navy-900 font-bold py-3 rounded-lg hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Checking..." : "Enter Exam"}
              </button>
              <p className="text-xs text-gray-400">
                Your administrator can give you a personal access code instead of an email account.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
