import { redirect } from "next/navigation";
import { Suspense } from "react";
import ThemeProvider from "@/components/ThemeProvider";
import TrainerRunner from "@/components/TrainerRunner";
import { getServerSideProfile, getThemeForUser } from "@/lib/themeServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export default async function TrainerPage() {
  const profile = await getServerSideProfile();
  if (!profile) redirect("/login?next=/trainer");

  const theme = await getThemeForUser(profile.id);
  const admin = supabaseAdmin();
  const { data: settings } = await admin.from("app_settings").select("music_globally_enabled").eq("id", 1).single();

  return (
    <ThemeProvider initialTheme={theme} musicGloballyEnabled={settings?.music_globally_enabled ?? true}>
      <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading...</div>}>
        <TrainerRunner />
      </Suspense>
    </ThemeProvider>
  );
}
