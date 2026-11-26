"use client";

import { ArrowRight, Inbox } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Delta, Kpi, PageTitle, useConsole } from "@/components/console";
import { Card, CardHead, Meter, Skeleton, cx } from "@/components/ui";
import { useApi } from "@/lib/api";
import { BUCKETS, date, naira, nairaShort, ratio, reason } from "@/lib/format";

type Overview = {
  today: string;
  portfolio: {
    activeLoans: number;
    outstanding: number;
    disbursedCount: number;
    disbursed: number;
    interestEarned: number;
    upfrontFees: number;
    lateFees: number;
    writtenOff: number;
    paidOff: number;
    writtenOffCount: number;
    par1: number;
    par30: number;
    par90: number;
  };
  buckets: { bucket: string; loans: number; outstanding: number }[];
  funnel: { submitted: number; autoApproved: number; referred: number; autoDeclined: number; accepted: number; offered: number; averageScore: number };
  declineReasons: { reason: string; count: number }[];
  disbursements: { week: string; loans: number; amount: number }[];
  collections: { due: number; collected: number; installments: number; onTime: number };
  queue: { referred: number; pendingChecker: number; openOffers: number };
  trends: { week: string; disbursed: number; collected: number; applications: number }[];
};

function halves(values: number[]) {
  const last = values.slice(-4).reduce((a, b) => a + b, 0);
  const prev = values.slice(-8, -4).reduce((a, b) => a + b, 0);
  return { last, prev };
}

export default function OverviewPage() {
  const { tick } = useConsole();
  const { data: o } = useApi<Overview>(`/console/overview?t=${tick}`);

  if (!o) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const p = o.portfolio;
  const queue = o.queue.referred + o.queue.pendingChecker;
  const disbursed = o.trends.map((t) => t.disbursed);
  const collected = o.trends.map((t) => t.collected);
  const apps = o.trends.map((t) => t.applications);
  const d = halves(disbursed);
  const c = halves(collected);
  const a = halves(apps);
  return (
    <div className="rise">
      <PageTitle title="Portfolio" meta={`As at close of ${date(o.today)}`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Disbursed, 4 weeks"
          value={nairaShort(d.last)}
          hint={`${nairaShort(p.outstanding)} outstanding across ${p.activeLoans} loans`}
          spark={disbursed}
          delta={<Delta now={d.last} before={d.prev} />}
        />
        <Kpi
          label="PAR 30"
          value={<span className={cx(p.par30 / Math.max(p.outstanding, 1) > 0.05 && "text-bad")}>{ratio(p.par30, p.outstanding)}</span>}
          hint={`${nairaShort(p.par30)} more than 30 days late`}
          accent={BUCKETS.DPD_31_60.color}
        />
        <Kpi
          label="Collected, 4 weeks"
          value={nairaShort(c.last)}
          hint={`${ratio(o.collections.onTime, o.collections.installments, 0)} of instalments paid on time`}
          accent="#2b5fb4"
          spark={collected}
          delta={<Delta now={c.last} before={c.prev} />}
        />
        <Kpi
          label="Applications, 4 weeks"
          value={a.last}
          hint={`${ratio(o.funnel.offered, o.funnel.submitted, 0)} approved · avg score ${o.funnel.averageScore}`}
          accent="#141815"
          spark={apps}
          delta={<Delta now={a.last} before={a.prev} />}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHead title="Disbursed per week" meta={`${nairaShort(p.disbursed)} across ${p.disbursedCount} loans to date`} />
          <WeeklyBars rows={o.disbursements} />
        </Card>
        <Card>
          <CardHead title="Days past due" meta="Outstanding principal by bucket" />
          <div className="px-5 pb-5">
            <div className="flex h-3 overflow-hidden rounded-full bg-ink/[0.06]">
              {o.buckets.map((b) => (
                <div key={b.bucket} style={{ width: `${(b.outstanding / Math.max(p.outstanding, 1)) * 100}%`, background: BUCKETS[b.bucket].color }} />
              ))}
            </div>
            <ul className="mt-5 space-y-3">
              {o.buckets.map((b) => (
                <li key={b.bucket}>
                  <Link href={`/console/loans?bucket=${b.bucket}`} className="group flex items-center gap-3 text-sm">
                    <span className="size-2.5 rounded-[3px]" style={{ background: BUCKETS[b.bucket].color }} />
                    <span className="flex-1 group-hover:underline">{BUCKETS[b.bucket].label}</span>
                    <span className="num w-10 text-right text-mute">{b.loans}</span>
                    <span className="num w-24 text-right font-medium">{naira(b.outstanding)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHead title="Decisions, 30 days" />
          <div className="space-y-4 px-5 pb-5">
            {[
              ["Approved automatically", o.funnel.autoApproved, "#0f6b4f"],
              ["Referred to an officer", o.funnel.referred, "#2b5fb4"],
              ["Declined automatically", o.funnel.autoDeclined, "#b4321f"],
              ["Offers accepted", o.funnel.accepted, "#141815"],
            ].map(([k, v, c]) => (
              <div key={k as string}>
                <div className="flex justify-between text-sm">
                  <span>{k as string}</span>
                  <span className="num font-medium">
                    {v as number} <span className="text-mute">· {ratio(v as number, o.funnel.submitted, 0)}</span>
                  </span>
                </div>
                <Meter value={v as number} max={o.funnel.submitted} color={c as string} className="mt-1.5" />
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHead title="Why we decline" meta="All time" />
          <ul className="space-y-3 px-5 pb-5">
            {o.declineReasons.length === 0 && <li className="text-sm text-mute">No declines yet.</li>}
            {o.declineReasons.map((r) => (
              <li key={r.reason}>
                <div className="flex justify-between text-sm">
                  <span>{reason(r.reason).label}</span>
                  <span className="num font-medium">{r.count}</span>
                </div>
                <Meter value={r.count} max={o.declineReasons[0].count} color="#b4321f" className="mt-1.5" />
              </li>
            ))}
          </ul>
        </Card>
        <div className="flex flex-col gap-6">
          <Link href="/console/applications" className="group block">
            <div className="relative overflow-hidden rounded-[18px] bg-ink p-5 text-sheet">
              <div className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-brand/60 blur-3xl" />
              <div className="relative flex items-center justify-between">
                <Inbox className="size-5 text-lime" />
                <ArrowRight className="size-4 text-sheet/50 transition group-hover:translate-x-0.5 group-hover:text-sheet" />
              </div>
              <p className="num display relative mt-5 text-[48px] leading-none">{queue}</p>
              <p className="relative mt-1 text-sm text-sheet/60">
                waiting for review · {o.queue.pendingChecker} need a manager
              </p>
            </div>
          </Link>
          <Card className="flex-1 p-5">
            <h3 className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Income to date</h3>
            <dl className="mt-3 space-y-2.5 text-sm">
              {[
                ["Interest", p.interestEarned],
                ["Upfront fees", p.upfrontFees],
                ["Late fees", p.lateFees],
                ["Written off", -p.writtenOff],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between">
                  <dt className="text-mute">{k as string}</dt>
                  <dd className={cx("num font-medium", (v as number) < 0 && "text-bad")}>{naira(v as number)}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

function WeeklyBars({ rows }: { rows: Overview["disbursements"] }) {
  const [hover, setHover] = useState<number>();
  const max = Math.max(...rows.map((r) => r.amount), 1);
  const shown = hover !== undefined ? rows[hover] : undefined;
  return (
    <div className="px-5 pb-5">
      <div className="mb-3 h-5 text-[13px]">
        {shown ? (
          <span>
            Week of {date(shown.week, true)} · <strong className="num">{naira(shown.amount)}</strong> <span className="text-mute">in {shown.loans} loans</span>
          </span>
        ) : (
          <span className="text-mute">Hover a week for detail</span>
        )}
      </div>
      <div className="flex h-52 items-end gap-2" onMouseLeave={() => setHover(undefined)}>
        {rows.map((r, i) => (
          <div key={r.week} className="flex h-full flex-1 flex-col justify-end" onMouseEnter={() => setHover(i)}>
            <div
              className={cx("w-full rounded-t-md transition-colors", hover === i ? "bg-brand" : i === rows.length - 1 ? "bg-lime" : "bg-brand/25")}
              style={{ height: `${Math.max(2, (r.amount / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 text-[11px] text-mute">
        {rows.map((r, i) => (
          <span key={r.week} className="flex-1 text-center">
            {i % 2 === 0 ? date(r.week, true) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
