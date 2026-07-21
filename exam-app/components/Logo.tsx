import Image from "next/image";

/**
 * Logo
 * ---------------------------------------------------------------------
 * Looks for /public/logo.svg first, then /public/logo.png. Drop your
 * official, approved company logo file into /public with one of those
 * exact names and it will appear automatically — no code changes needed.
 * If neither file exists, a clean text wordmark is shown instead so the
 * app never ships with a placeholder/fake logo.
 */
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt="Company logo"
        className="h-8 w-auto"
        onError={(e) => {
          const img = e.currentTarget;
          if (img.src.endsWith("/logo.svg")) {
            img.src = "/logo.png";
          } else {
            img.style.display = "none";
            const fallback = document.getElementById("logo-fallback-text");
            if (fallback) fallback.style.display = "inline-block";
          }
        }}
      />
      <span
        id="logo-fallback-text"
        style={{ display: "none" }}
        className="text-white font-bold tracking-wide text-lg"
      >
        UNIT FUNCTION EXAM
      </span>
    </div>
  );
}
