import { redirect } from "next/navigation";
import Header from "@/components/Header";
import TurbineHero from "@/components/TurbineHero";
import ThemeProvider from "@/components/ThemeProvider";
import StartExamButton from "@/components/StartExamButton";
import { getServerSideProfile, getThemeForUser } from "@/lib/themeServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { loadExamSettings } from "@/lib/examEngine";

export default async function HomePage() {
  const profile = await getServerSideProfile();

  // Admins/managers/reviewers land in the admin dashboard, not the exam start screen.
  if (profile && profile.role_id !== "trainee") {
    redirect("/admin");
  }

  const theme = await getThemeForUser(profile?.id ?? null);
  const admin = supabaseAdmin();
  const { data: appSettings } = await admin.from("app_settings").select("music_globally_enabled").eq("id", 1).single();
  const examSettings = await loadExamSettings();

  let canStart = false;
  let blockedReason: string | null = null;

  if (profile) {
    const { data: access } = await admin
      .from("exam_access")
      .select("allowed_to_take, allow_retake, max_attempts, attempts_used")
      .eq("user_id", profile.id)
      .maybeSingle();

    const retakeAllowed = examSettings.allow_retake && !!access?.allow_retake;

    if (!access || !access.allowed_to_take) {
      blockedReason = "You are not currently approved to take this exam. Contact your administrator.";
    } else if (access.attempts_used >= access.max_attempts && !retakeAllowed) {
      blockedReason = "You have already used your exam attempt. Contact your administrator if you need a retake.";
    } else {
      canStart = true;
    }
  }

  return (
    <ThemeProvider initialTheme={theme} musicGloballyEnabled={appSettings?.music_globally_enabled ?? true}>
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-10 w-full">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold mb-2" style={{ color: "var(--text-color)" }}>
                Unit Function Exam
              </h1>
              <p className="text-lg font-medium mb-8" style={{ color: "var(--accent-color)" }}>
                Operator Training &amp; Assessment
              </p>

              <div
                className="rounded-2xl shadow-card p-6 max-w-md"
                style={{ backgroundColor: "var(--card-color)" }}
              >
                {profile ? (
                  <>
                    <p className="text-sm text-gray-500 mb-4">
                      Signed in as <strong>{profile.display_name}</strong>
                    </p>
                    <StartExamButton canStart={canStart} blockedReason={blockedReason} />
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-600 mb-4">
                      Sign in with your account or access code to begin the exam.
                    </p>
                    <a
                      href="/login"
                      style={{ backgroundColor: "var(--button-color)" }}
                      className="block text-center text-navy-900 font-bold py-3 rounded-lg hover:opacity-90"
                    >
                      Sign In
                    </a>
                  </>
                )}
                <p className="text-xs text-gray-500 mt-3">
                  {examSettings.total_questions} questions • mixed order
                </p>
              </div>
            </div>

            <TurbineHero />
          </div>
        </main>
        <footer className="text-center text-xs text-gray-400 py-6">
          Unit Function Exam — Internal Training Platform
        </footer>
      </div>
    </ThemeProvider>
  );
}
