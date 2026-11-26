"use client";

import { MotionConfig } from "motion/react";
import { EngineDemo } from "@/components/landing/engine";
import { Hero, LandingNav } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how";
import { EarlyPayoff, Faq, FinalCta, LandingFooter, Numbers } from "@/components/landing/more";

export default function Home() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen overflow-x-clip">
        <LandingNav />
        <Hero />
        <Numbers />
        <HowItWorks />
        <EngineDemo />
        <EarlyPayoff />
        <Faq />
        <FinalCta />
        <LandingFooter />
      </div>
    </MotionConfig>
  );
}
