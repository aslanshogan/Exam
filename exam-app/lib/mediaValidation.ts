export type MediaKind = "logo" | "background-image" | "background-video" | "music" | "turbine-model";

export const BUCKET_BY_KIND: Record<MediaKind, string> = {
  logo: "logos",
  "background-image": "background-images",
  "background-video": "background-videos",
  music: "music",
  "turbine-model": "turbine-models",
};

export const ALLOWED_EXTENSIONS: Record<MediaKind, string[]> = {
  logo: ["png", "svg", "jpg", "jpeg", "webp"],
  "background-image": ["jpg", "jpeg", "png", "webp"],
  "background-video": ["mp4", "webm"],
  music: ["mp3", "wav", "ogg"],
  "turbine-model": ["glb"],
};

export const MAX_SIZE_BYTES: Record<MediaKind, number> = {
  logo: 5 * 1024 * 1024, // 5MB
  "background-image": 10 * 1024 * 1024, // 10MB
  "background-video": 80 * 1024 * 1024, // 80MB
  music: 25 * 1024 * 1024, // 25MB
  "turbine-model": 40 * 1024 * 1024, // 40MB
};

export function validateMediaFile(kind: MediaKind, filename: string, sizeBytes: number): string | null {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_EXTENSIONS[kind].includes(ext)) {
    return `File type ".${ext}" is not allowed for ${kind}. Allowed: ${ALLOWED_EXTENSIONS[kind].join(", ")}`;
  }
  if (sizeBytes > MAX_SIZE_BYTES[kind]) {
    const maxMb = (MAX_SIZE_BYTES[kind] / (1024 * 1024)).toFixed(0);
    return `File is too large for ${kind}. Max size is ${maxMb}MB.`;
  }
  return null;
}

const KNOWN_BUCKETS = new Set(Object.values(BUCKET_BY_KIND));

/**
 * parseStorageUrl
 * ---------------------------------------------------------------------
 * Reverses supabase.storage.from(bucket).getPublicUrl(path) — given the
 * public URL we generated and stored on a theme row, extracts the
 * {bucket, path} needed to delete the underlying object. Only ever
 * matches our 5 known media buckets, so this can't be abused to delete
 * arbitrary storage objects via a crafted URL.
 *
 * Supabase public URLs look like:
 *   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path...>
 */
export function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  if (!url) return null;
  const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!match) return null;
  const [, bucket, path] = match;
  if (!KNOWN_BUCKETS.has(bucket)) return null;
  return { bucket, path: decodeURIComponent(path) };
}
