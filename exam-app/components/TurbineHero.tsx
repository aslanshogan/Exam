"use client";

import { Component, ReactNode, Suspense, lazy } from "react";

/**
 * TurbineHero — resilient wrapper around the WebGL/three.js hero.
 * ---------------------------------------------------------------------
 * The 3D turbine is purely decorative. On some machines a strict
 * Content Security Policy (often injected by a browser extension or a
 * corporate network) blocks the `eval`-style code that three.js uses to
 * compile shaders, which throws during render. Without this wrapper
 * that exception would bubble up through React and crash the ENTIRE
 * page with "a client-side exception has occurred" — taking the exam
 * app down over a decorative graphic.
 *
 * This:
 *   1. Lazy-loads the actual 3D component (TurbineHero3D) so the heavy
 *      three.js bundle never blocks first paint, and any load-time
 *      failure is contained.
 *   2. Wraps it in an error boundary that, on ANY failure, swaps in a
 *      clean static gradient panel — so the page always renders.
 */
const TurbineHero3D = lazy(() => import("./TurbineHero3D"));

function StaticHeroFallback() {
  return (
    <div className="w-full h-[320px] md:h-[440px] rounded-2xl overflow-hidden bg-gradient-to-br from-navy-800 to-teal-700 flex items-center justify-center">
      <div className="text-center px-6">
        <div className="text-white/90 text-5xl mb-3" aria-hidden>
          ⚙
        </div>
        <p className="text-white/80 font-semibold tracking-wide">Operator Training Platform</p>
      </div>
    </div>
  );
}

class HeroErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // Intentionally swallow — the decorative 3D hero failing is not an
    // error worth surfacing to the user; the static fallback covers it.
  }
  render() {
    if (this.state.failed) return <StaticHeroFallback />;
    return this.props.children;
  }
}

export default function TurbineHero() {
  return (
    <HeroErrorBoundary>
      <Suspense fallback={<StaticHeroFallback />}>
        <TurbineHero3D />
      </Suspense>
    </HeroErrorBoundary>
  );
}
