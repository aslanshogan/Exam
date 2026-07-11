# Uploading large background videos / images

## What changed (v4.3)
Uploads used to go: **browser → Vercel function → Supabase Storage**.
Vercel serverless functions reject any request body over ~4.5 MB with
`FUNCTION_PAYLOAD_TOO_LARGE`, so large videos failed even though the app
allows up to 80 MB.

Now uploads go: **browser → Supabase Storage directly** (the Vercel
function only hands out a short-lived signed URL — the file bytes never
pass through Vercel). So the ~4.5 MB Vercel limit no longer applies.

## There is a SECOND limit: your Supabase bucket
Supabase Storage has its own per-bucket file-size cap. By default a
project's global limit is often **50 MB**, which is below the app's
80 MB video allowance. If a big video still fails after this update with
a Supabase "Payload too large" / "exceeded the maximum allowed size"
error, raise the bucket limit:

**Option A — Supabase dashboard (easiest):**
1. Supabase → **Storage** → click the bucket (e.g. `theme-videos`).
2. Bucket settings → **File size limit** → raise it (e.g. 100 MB).
3. Save. Re-upload.

**Option B — SQL:**
```sql
-- Raise the size limit on the video bucket to 100 MB.
update storage.buckets
set file_size_limit = 104857600  -- 100 MB in bytes
where id = 'theme-videos';
```
(Adjust the bucket id to match yours — check Storage in the dashboard.
Other buckets: theme-images, theme-music, logos, turbine-models.)

You may also have a **project-wide** upload limit under
Supabase → Settings → Storage — raise that too if it's lower than your
file.

## Practical advice
Big autoplay background videos hurt page-load speed for trainees on slow
connections. Consider compressing the video (aim for well under 20 MB —
tools like HandBrake export small, web-friendly MP4s), or use a
background **image** instead, which is far lighter. The app supports up
to 80 MB video, but smaller is a better experience.
