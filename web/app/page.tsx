"use client";

import { ArrowRight, BadgeCheck, FileText, Gauge, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoanPicker, type Pick, QuoteSummary, clampPick, useProducts, useQuote } from "@/components/calculator";
import { SiteFooter, SiteHeader } from "@/components/site";
import { Button, Skeleton } from "@/components/ui";

export default function Home() {
  const products = useProducts();
  const [chosen, setPick] = useState<Pick>();
  const pick = chosen ?? (products?.length ? clampPick(products.find((p) => p.code === "SALARY") ?? products[0], { amount: 15_000_000, tenor: 6 }) : undefined);
  const quote = useQuote(pick);
  const router = useRouter();

  const start = () => {
    if (pick) sessionStorage.setItem("credline:pick", JSON.stringify(pick));
    router.push("/apply");
  };

  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden bg-ink text-sheet">
        <div className="pointer-events-none absolute -top-40 right-[-10%] size-[620px] rounded-full bg-brand/40 blur-[120px]" />
        <div className="pointer-events-none absolute bottom-[-30%] left-[-10%] size-[420px] rounded-full bg-lime/10 blur-[100px]" />
        <SiteHeader dark />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-5 pt-10 pb-20 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-16 lg:pb-28">
          <div className="rise">
            <span className="inline-flex items-center gap-2 rounded-full border border-sheet/15 px-3 py-1 text-[12px] text-sheet/70">
              <span className="size-1.5 rounded-full bg-lime" /> Decisions in under a minute
            </span>
            <h1 className="display mt-6 text-[52px] leading-[0.98] sm:text-[76px]">
              Credit that
              <br />
              tells you <em className="text-lime">why.</em>
            </h1>
            <p className="mt-6 max-w-md text-[17px] leading-relaxed text-sheet/70">
              Salary and business loans up to ₦3 million. Every decision comes with its reasons, and every offer shows the full cost before you sign.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button tone="secondary" size="lg" onClick={start} className="border-transparent bg-lime text-ink hover:bg-lime/90">
                Apply in three minutes <ArrowRight className="size-4" />
              </Button>
              <Button href="/signin" tone="ghost" size="lg" className="text-sheet/80 hover:bg-sheet/10 hover:text-sheet">
                I have an account
              </Button>
            </div>
            <dl className="mt-14 grid max-w-md grid-cols-3 gap-6 border-t border-sheet/10 pt-6">
              {[
                ["3.5%", "monthly from"],
                ["12", "months max"],
                ["₦0", "early repayment fee"],
              ].map(([v, k]) => (
                <div key={k}>
                  <dt className="display text-[30px] leading-none">{v}</dt>
                  <dd className="mt-1.5 text-[12px] text-sheet/55">{k}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rise rounded-[24px] bg-sheet p-6 text-ink shadow-pop sm:p-8" style={{ animationDelay: "80ms" }}>
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
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <h2 className="display max-w-xl text-[40px] leading-[1.05]">No black boxes. No surprise charges.</h2>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {[
            [Gauge, "A decision you can read", "Your score is built from a handful of factors, and we tell you which ones moved it."],
            [FileText, "Key facts up front", "Amount received, monthly payment, total cost and APR, before you accept anything."],
            [ShieldCheck, "Repay early, pay less", "Close the loan any day and only pay interest up to the current month."],
            [BadgeCheck, "Grow your limit", "Repay on time and your next loan is scored on your history with us."],
          ].map(([Icon, t, d]) => {
            const I = Icon as typeof Gauge;
            return (
              <div key={t as string} className="rounded-[18px] border border-line bg-sheet p-6">
                <div className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
                  <I className="size-5" />
                </div>
                <h3 className="mt-5 font-semibold">{t as string}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mute">{d as string}</p>
              </div>
            );
          })}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
