import { redirect } from "next/navigation";
import { Suspense } from "react";
import ThemeProvider from "@/components/ThemeProvider";
import ExamRunner from "@/components/ExamRunner";
import { getServerSideProfile, getThemeForUser } from "@/lib/themeServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export default async function ExamPage() {
  const profile = await getServerSideProfile();
  if (!profile) redirect("/login?next=/exam");

  const theme = await getThemeForUser(profile.id);
  const admin = supabaseAdmin();
  const { data: settings } = await admin.from("app_settings").select("music_globally_enabled").eq("id", 1).single();

  return (
    <ThemeProvider initialTheme={theme} musicGloballyEnabled={settings?.music_globally_enabled ?? true}>
      <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading...</div>}>
        <ExamRunner />
      </Suspense>
    </ThemeProvider>
  );
}
