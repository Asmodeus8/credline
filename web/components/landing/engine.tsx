"use client";

import { AnimatePresence, motion, useSpring, useTransform } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Segmented, cx } from "@/components/ui";
import { type Employment, decide } from "@/lib/engine";
import { naira } from "@/lib/format";
import { Reveal } from "./motion";

const MIN = 300;
const MAX = 820;

function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-sheet/70">{label}</span>
        <span className="num text-[17px] font-semibold text-sheet">{format(value)}</span>
      </div>
      <input
        type="range"
        className="range-dark mt-3 w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ["--fill" as string]: `${fill}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

const TONE = {
  APPROVE: { label: "Approved", color: "#c8f169", text: "text-ink", bg: "bg-lime" },
  COUNTER: { label: "Approved, adjusted", color: "#c8f169", text: "text-ink", bg: "bg-lime" },
  REFER: { label: "Sent to an officer", color: "#8fb3ff", text: "text-ink", bg: "bg-[#8fb3ff]" },
  DECLINE: { label: "Declined", color: "#ff8a73", text: "text-ink", bg: "bg-[#ff8a73]" },
};

function Gauge({ score, color }: { score: number; color: string }) {
  const spring = useSpring(MIN, { stiffness: 90, damping: 18 });
  useEffect(() => spring.set(score), [score, spring]);
  const tipX = useTransform(spring, (s) => 150 + Math.cos(Math.PI - ((s - MIN) / (MAX - MIN)) * Math.PI) * 100);
  const tipY = useTransform(spring, (s) => 150 - Math.sin(Math.PI - ((s - MIN) / (MAX - MIN)) * Math.PI) * 100);
  const length = useTransform(spring, (s) => (s - MIN) / (MAX - MIN));
  const [shown, setShown] = useState(score);
  useEffect(() => spring.on("change", (v) => setShown(Math.round(v))), [spring]);
  const cut = (v: number) => {
    const a = Math.PI - ((v - MIN) / (MAX - MIN)) * Math.PI;
    return { x: 150 + Math.cos(a) * 128, y: 150 - Math.sin(a) * 128 };
  };
  return (
    <div className="relative mx-auto w-full max-w-[340px]">
      <svg viewBox="0 0 300 170" className="w-full overflow-visible">
        <path d="M22 150 A128 128 0 0 1 278 150" fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="18" strokeLinecap="round" />
        <motion.path d="M22 150 A128 128 0 0 1 278 150" fill="none" stroke={color} strokeWidth="18" strokeLinecap="round" style={{ pathLength: length }} />
        {[520, 600].map((v) => {
          const p = cut(v);
          return <circle key={v} cx={p.x} cy={p.y} r="3.5" fill="#141815" stroke="rgb(255 255 255 / 0.6)" strokeWidth="1.5" />;
        })}
        <motion.line x1={150} y1={150} x2={tipX} y2={tipY} stroke="#fbfaf7" strokeWidth={3} strokeLinecap="round" />
        <circle cx="150" cy="150" r="9" fill="#fbfaf7" />
      </svg>
      <p className="num display -mt-1 text-center text-[64px] leading-none text-sheet">{shown}</p>
      <div className="mt-2 flex justify-between px-1 text-[11px] text-sheet/40">
        <span>300</span>
        <span>520 review · 600 approve</span>
        <span>820</span>
      </div>
    </div>
  );
}

export function EngineDemo() {
  const [income, setIncome] = useState(25_000_000);
  const [debt, setDebt] = useState(2_000_000);
  const [bureau, setBureau] = useState(660);
  const [employment, setEmployment] = useState<Employment>("SALARIED");
  const [amount, setAmount] = useState(15_000_000);
  const [tenor, setTenor] = useState(6);
  const r = useMemo(() => decide({ income, debt, bureau, employment, amount, tenor, rateBps: 350 }), [income, debt, bureau, employment, amount, tenor]);
  const tone = TONE[r.outcome];

  return (
    <section id="engine" className="relative scroll-mt-16 overflow-hidden bg-ink py-24 text-sheet lg:py-32">
      <div className="pointer-events-none absolute top-1/3 -left-40 size-[520px] rounded-full bg-brand/30 blur-[140px]" />
      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <p className="text-[12px] font-semibold tracking-[0.16em] text-lime uppercase">The decision</p>
          <h2 className="display mt-3 max-w-3xl text-[44px] leading-[1.02] sm:text-[56px]">Move the sliders. Watch the decision change.</h2>
          <p className="mt-4 max-w-xl text-sheet/60">The same rules and points our engine uses for a first loan. Nothing about how you&apos;re scored is hidden.</p>
        </Reveal>

        <div className="mt-14 grid items-start gap-8 lg:grid-cols-[1fr_1.1fr]">
          <Reveal className="space-y-7 rounded-[24px] border border-sheet/10 bg-sheet/[0.04] p-6 sm:p-8">
            <Slider label="Monthly income" value={income} min={2_000_000} max={100_000_000} step={1_000_000} onChange={setIncome} format={naira} />
            <Slider label="Existing loan repayments" value={debt} min={0} max={30_000_000} step={500_000} onChange={setDebt} format={(v) => `${naira(v)}/mo`} />
            <Slider label="Credit bureau score" value={bureau} min={350} max={850} step={5} onChange={setBureau} format={String} />
            <Slider label="Amount you want" value={amount} min={2_000_000} max={30_000_000} step={500_000} onChange={setAmount} format={naira} />
            <Slider label="Months to repay" value={tenor} min={1} max={12} step={1} onChange={setTenor} format={(v) => `${v} mo`} />
            <div>
              <p className="mb-2.5 text-[13px] font-medium text-sheet/70">Work</p>
              <Segmented
                value={employment}
                onChange={setEmployment}
                className="w-full border-sheet/10 bg-sheet/5 [&>button]:flex-1 [&>button]:px-2 [&>button]:text-[12px] sm:[&>button]:text-[13px] [&>button]:text-sheet/60 [&>button[class*='bg-sheet']]:text-ink"
                options={[
                  { value: "SALARIED", label: "Salaried" },
                  { value: "CIVIL_SERVANT", label: "Civil servant" },
                  { value: "SELF_EMPLOYED", label: "Self-employed" },
                ]}
              />
            </div>
          </Reveal>

          <Reveal delay={0.1} className="rounded-[24px] border border-sheet/10 bg-gradient-to-b from-sheet/[0.07] to-sheet/[0.02] p-6 sm:p-8">
            <Gauge score={r.score} color={tone.color} />
            <div className="mt-6 flex justify-center">
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={r.outcome}
                  initial={{ opacity: 0, y: 12, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 300, damping: 22 }}
                  className={cx("rounded-full px-4 py-1.5 text-[14px] font-semibold", tone.bg, tone.text)}
                >
                  {tone.label}
                </motion.span>
              </AnimatePresence>
            </div>
            <p className="mx-auto mt-3 max-w-sm text-center text-sm text-sheet/60">{r.reason}</p>

            <div className="mt-7 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-sheet/[0.06] p-4">
                <p className="text-[12px] text-sheet/50">Offer</p>
                <p className="num mt-1 text-[22px] font-semibold">{r.offer ? naira(r.offer) : "—"}</p>
              </div>
              <div className="rounded-2xl bg-sheet/[0.06] p-4">
                <p className="text-[12px] text-sheet/50">Monthly repayment</p>
                <p className="num mt-1 text-[22px] font-semibold">{r.offer ? naira(r.installment) : "—"}</p>
              </div>
            </div>

            <div className="mt-7 space-y-3.5">
              {r.factors.map((f) => (
                <div key={f.name}>
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="text-sheet/70">
                      {f.name} <span className="text-sheet/40">· {f.value}</span>
                    </span>
                    <span className="num font-semibold text-lime">+{f.points}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sheet/10">
                    <motion.div className="h-full rounded-full bg-lime" animate={{ width: `${(f.points / f.max) * 100}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 text-[12px] text-sheet/40">
              Repayments can use up to 40% of income after existing debt: {naira(r.capacity)} a month here. Illustration for a salary loan at 3.5% a month.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
