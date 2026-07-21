import { redirect } from "next/navigation";
import Header from "@/components/Header";
import ThemeProvider from "@/components/ThemeProvider";
import HomeHero from "@/components/HomeHero";
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
        <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-10 w-full">
          <HomeHero
            isLoggedIn={!!profile}
            displayName={profile?.display_name ?? null}
            canStart={canStart}
            blockedReason={blockedReason}
            totalQuestions={examSettings.total_questions}
          />
        </main>
        <footer className="text-center text-xs text-gray-400 py-6">
          Unit Function Exam — Internal Training Platform
        </footer>
      </div>
    </ThemeProvider>
  );
}
