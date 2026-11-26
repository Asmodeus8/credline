"use client";

import { ArrowRight, BadgeCheck, Landmark } from "lucide-react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoanPicker, type Pick, QuoteSummary, clampPick, useProducts, useQuote } from "@/components/calculator";
import { Button, Logo, Skeleton, cx } from "@/components/ui";
import { Words } from "./motion";

export function LandingNav() {
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setSolid(y > 60));
  return (
    <header
      className={cx(
        "fixed inset-x-0 top-0 z-40 transition-all duration-300",
        solid ? "border-b border-line bg-paper/80 text-ink shadow-[0_8px_30px_-20px_rgb(0_0_0/0.4)] backdrop-blur-xl" : "text-sheet",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="Credline home">
          <Logo light={!solid} />
        </Link>
        <nav className="hidden items-center gap-1 text-sm font-medium md:flex">
          {[
            ["How it works", "#how"],
            ["The decision", "#engine"],
            ["Repay early", "#early"],
            ["FAQ", "#faq"],
          ].map(([label, href]) => (
            <a key={href} href={href} className={cx("rounded-full px-3.5 py-2 transition", solid ? "text-ink-2 hover:bg-ink/5 hover:text-ink" : "text-sheet/70 hover:bg-sheet/10 hover:text-sheet")}>
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/signin" className={cx("hidden rounded-full px-4 py-2 text-sm font-medium sm:block", solid ? "text-ink-2 hover:text-ink" : "text-sheet/80 hover:text-sheet")}>
            Sign in
          </Link>
          <Button href="/apply" tone={solid ? "primary" : "secondary"} size="sm" className="h-9 px-4">
            Apply <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </header>
  );
}

function Chip({ className, delay, children, drift = 8 }: { className: string; delay: number; children: React.ReactNode; drift?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cx("absolute z-10 hidden items-center gap-2.5 rounded-2xl border border-white/60 bg-sheet/95 px-3.5 py-2.5 text-[13px] text-ink shadow-pop backdrop-blur lg:flex", className)}
      initial={reduce ? false : { opacity: 0, scale: 0.85, y: 16 }}
      animate={reduce ? undefined : { opacity: 1, scale: 1, y: [0, -drift, 0] }}
      transition={{ opacity: { delay, duration: 0.5 }, scale: { delay, duration: 0.5 }, y: { delay: delay + 0.5, duration: 5, repeat: Infinity, ease: "easeInOut" } }}
    >
      {children}
    </motion.div>
  );
}

export function Hero() {
  const products = useProducts();
  const [chosen, setPick] = useState<Pick>();
  const pick = chosen ?? (products?.length ? clampPick(products.find((p) => p.code === "SALARY") ?? products[0], { amount: 15_000_000, tenor: 6 }) : undefined);
  const quote = useQuote(pick);
  const router = useRouter();
  const reduce = useReducedMotion();

  const start = () => {
    if (pick) sessionStorage.setItem("credline:pick", JSON.stringify(pick));
    router.push("/apply");
  };

  return (
    <section className="relative overflow-hidden bg-ink text-sheet">
      <motion.div
        className="pointer-events-none absolute -top-48 right-[-12%] size-[680px] rounded-full bg-brand/45 blur-[130px]"
        animate={reduce ? undefined : { x: [0, -60, 0], y: [0, 40, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute bottom-[-35%] left-[-12%] size-[520px] rounded-full bg-lime/12 blur-[110px]"
        animate={reduce ? undefined : { x: [0, 80, 0], y: [0, -30, 0] }}
        transition={{ duration: 19, repeat: Infinity, ease: "easeInOut" }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "64px 64px", maskImage: "radial-gradient(ellipse at 30% 40%, black 20%, transparent 70%)" }}
      />

      <div className="relative mx-auto grid max-w-6xl gap-14 px-5 pt-32 pb-24 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-40 lg:pb-32">
        <div>
          <motion.span
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full border border-sheet/15 bg-sheet/5 px-3 py-1 text-[12px] text-sheet/75"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-lime opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-lime" />
            </span>
            Decisions in under a minute
          </motion.span>
          <h1 className="display mt-6 text-[54px] leading-[0.98] sm:text-[80px]">
            <Words text="Credit that" />
            <br />
            <Words text="tells you" delay={0.15} />
            <motion.em
              className="inline-block text-lime"
              initial={reduce ? false : { opacity: 0, rotate: -6, y: 20 }}
              animate={{ opacity: 1, rotate: 0, y: 0 }}
              transition={{ delay: 0.55, type: "spring", stiffness: 140, damping: 12 }}
            >
              why.
            </motion.em>
          </h1>
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.7 }}
            className="mt-7 max-w-md text-[17px] leading-relaxed text-sheet/70"
          >
            Salary and business loans up to ₦3 million. Every decision comes with its reasons, and every offer shows the full cost before you sign.
          </motion.p>
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.7 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Button tone="lime" size="lg" onClick={start} className="group">
              Apply in three minutes <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </Button>
            <Button href="#engine" tone="ghost" size="lg" className="text-sheet/80 hover:bg-sheet/10 hover:text-sheet">
              See how we decide
            </Button>
          </motion.div>
        </div>

        <motion.div
          className="relative"
          initial={reduce ? false : { opacity: 0, y: 40, rotate: 1.5 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ delay: 0.25, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <Chip className="-bottom-7 -left-16" delay={1.1}>
            <span className="grid size-7 place-items-center rounded-full bg-brand-soft text-brand">
              <BadgeCheck className="size-4" />
            </span>
            <span>
              <span className="block font-semibold">Approved</span>
              <span className="text-[11px] text-mute">score 684 · 4.2 seconds</span>
            </span>
          </Chip>
          <Chip className="-top-7 -right-8" delay={1.4} drift={10}>
            <span className="grid size-7 place-items-center rounded-full bg-ink text-lime">
              <Landmark className="size-3.5" />
            </span>
            <span>
              <span className="block font-semibold">₦148,500 paid out</span>
              <span className="text-[11px] text-mute">to GTBank ••6789</span>
            </span>
          </Chip>

          <div className="rounded-[26px] bg-sheet p-6 text-ink shadow-pop ring-1 ring-white/10 sm:p-8">
            {products && pick ? (
              <div className="grid gap-8">
                <LoanPicker products={products} pick={pick} onChange={setPick} />
                <div className="rounded-2xl bg-paper p-5">
                  <QuoteSummary quote={quote} />
                </div>
                <Button size="lg" onClick={start} className="w-full">
                  Check my offer <ArrowRight className="size-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                <Skeleton className="h-10" />
                <Skeleton className="h-16" />
                <Skeleton className="h-10" />
                <Skeleton className="h-64" />
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <div className="relative border-t border-sheet/10 py-5">
        <div className="flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
          <div className="marquee flex shrink-0 items-center gap-12 pr-12 text-[13px] font-medium tracking-wide text-sheet/45 uppercase">
            {[...BANKS, ...BANKS].map((b, i) => (
              <span key={i} className="flex items-center gap-12 whitespace-nowrap">
                {b}
                <span className="size-1 rounded-full bg-lime/60" />
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const BANKS = ["Paid out to any Nigerian bank", "GTBank", "Access", "First Bank", "UBA", "Zenith", "Kuda", "OPay", "Moniepoint", "Fidelity", "Sterling"];
