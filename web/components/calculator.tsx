"use client";

import { useEffect, useMemo, useState } from "react";
import { Segmented, Skeleton, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { naira, pct } from "@/lib/format";
import type { Product, Quote } from "@/lib/types";

export type Pick = { product: string; amount: number; tenor: number };

const STEP = 500_000;

export function useProducts() {
  const [products, setProducts] = useState<Product[]>();
  useEffect(() => {
    api<Product[]>("/products").then(setProducts).catch(() => setProducts([]));
  }, []);
  return products;
}

export function useQuote(pick: Pick | undefined) {
  const [quote, setQuote] = useState<Quote>();
  useEffect(() => {
    if (!pick) return;
    const t = setTimeout(() => {
      api<Quote>("/quote", { method: "POST", body: pick }).then(setQuote).catch(() => {});
    }, 120);
    return () => clearTimeout(t);
  }, [pick]);
  return quote;
}

export function clampPick(p: Product, pick: Partial<Pick>): Pick {
  const amount = Math.min(p.maxAmount, Math.max(p.minAmount, Math.round((pick.amount ?? p.minAmount * 5) / STEP) * STEP));
  const tenor = Math.min(p.maxTenor, Math.max(p.minTenor, pick.tenor ?? Math.min(6, p.maxTenor)));
  return { product: p.code, amount, tenor };
}

export function LoanPicker({ products, pick, onChange, compact }: { products: Product[]; pick: Pick; onChange: (p: Pick) => void; compact?: boolean }) {
  const product = products.find((p) => p.code === pick.product) ?? products[0];
  const fill = ((pick.amount - product.minAmount) / (product.maxAmount - product.minAmount)) * 100;
  const tenors = Array.from({ length: product.maxTenor - product.minTenor + 1 }, (_, i) => product.minTenor + i);
  return (
    <div className="space-y-6">
      <Segmented
        value={product.code}
        onChange={(code) => onChange(clampPick(products.find((p) => p.code === code)!, pick))}
        options={products.map((p) => ({ value: p.code, label: p.name }))}
        className="w-full [&>button]:flex-1"
      />
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-medium text-ink-2">How much</span>
          <span className="num display text-[34px] leading-none">{naira(pick.amount)}</span>
        </div>
        <input
          type="range"
          aria-label="Amount"
          className="mt-4 w-full"
          min={product.minAmount}
          max={product.maxAmount}
          step={STEP}
          value={pick.amount}
          style={{ ["--fill" as string]: `${fill}%` }}
          onChange={(e) => onChange({ ...pick, amount: Number(e.target.value) })}
        />
        <div className="mt-2 flex justify-between text-[12px] text-mute num">
          <span>{naira(product.minAmount)}</span>
          <span>{naira(product.maxAmount)}</span>
        </div>
      </div>
      <div>
        <span className="text-[13px] font-medium text-ink-2">For how long</span>
        <div className={cx("mt-2 grid gap-1.5", compact ? "grid-cols-6" : "grid-cols-6")}>
          {tenors.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChange({ ...pick, tenor: t })}
              className={cx(
                "h-10 rounded-xl border text-sm font-medium transition num",
                t === pick.tenor ? "border-ink bg-ink text-sheet" : "border-line bg-white text-ink-2 hover:border-ink/40",
              )}
            >
              {t}
              <span className="ml-0.5 text-[11px] opacity-60">mo</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function QuoteSummary({ quote, dark }: { quote?: Quote; dark?: boolean }) {
  const rows = useMemo(
    () =>
      quote
        ? [
            ["You receive", naira(quote.disbursed), quote.fee > 0 ? `after ${naira(quote.fee)} fee` : "no upfront fee"],
            ["Interest", naira(quote.totalInterest), `${pct(quote.monthlyRateBps)} a month, reducing balance`],
            ["Total to repay", naira(quote.totalRepayable), `${quote.tenorMonths} monthly payments`],
            ["APR", pct(quote.aprBps), "all costs, per year"],
          ]
        : [],
    [quote],
  );
  return (
    <div>
      <p className={cx("text-[13px] font-medium", dark ? "text-sheet/60" : "text-mute")}>Monthly repayment</p>
      {quote ? (
        <p className="num display mt-1 text-[56px] leading-[0.95] tracking-tight">{naira(quote.installment)}</p>
      ) : (
        <Skeleton className="mt-2 h-12 w-48 opacity-30" />
      )}
      <dl className={cx("mt-6 divide-y", dark ? "divide-sheet/10" : "divide-line")}>
        {rows.map(([k, v, hint]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 py-3">
            <dt>
              <span className="text-sm">{k}</span>
              <span className={cx("block text-[12px]", dark ? "text-sheet/50" : "text-mute")}>{hint}</span>
            </dt>
            <dd className="num text-[17px] font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
