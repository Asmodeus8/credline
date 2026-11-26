"use client";

import { Download, HandCoins } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Kpi, PageTitle, Tabs, exportCsv, useConsole } from "@/components/console";
import { Badge, Button, Card, CardHead, Empty, Skeleton, cx } from "@/components/ui";
import { useApi } from "@/lib/api";
import { date, naira, nairaShort } from "@/lib/format";

type Data = {
  totals: { channel: string; count: number; amount: number; principal: number; interest: number; lateFees: number }[];
  daily: { day: string; amount: number; count: number }[];
  rows: {
    id: number;
    reference: string;
    channel: string;
    amount: number;
    toLateFees: number;
    toInterest: number;
    toPrincipal: number;
    toRefund: number;
    receivedOn: string;
    recordedBy?: string;
    loanId: number;
    loanReference: string;
    borrowerName: string;
  }[];
};

const CHANNEL: Record<string, { label: string; tone: "good" | "info" | "brand"; color: string }> = {
  CARD_DEBIT: { label: "Auto-debit", tone: "good", color: "#0f6b4f" },
  CARD: { label: "Card payment", tone: "info", color: "#2b5fb4" },
  TRANSFER: { label: "Bank transfer", tone: "brand", color: "#141815" },
};

export default function Repayments() {
  const { tick } = useConsole();
  const [channel, setChannel] = useState("ALL");
  const [hover, setHover] = useState<number>();
  const { data } = useApi<Data>(`/console/repayments?channel=${channel}&t=${tick}`);
  const month = data?.totals.reduce((s, t) => s + t.amount, 0) ?? 0;
  const split = data?.totals.reduce((a, t) => ({ p: a.p + t.principal, i: a.i + t.interest, f: a.f + t.lateFees }), { p: 0, i: 0, f: 0 }) ?? { p: 0, i: 0, f: 0 };
  const max = Math.max(...(data?.daily.map((d) => d.amount) ?? [1]), 1);
  const shown = hover !== undefined ? data?.daily[hover] : undefined;

  return (
    <div>
      <PageTitle
        title="Repayments"
        meta="Money received, and how each payment was applied: late fees, then interest, then principal"
        action={
          <Button
            tone="secondary"
            size="sm"
            disabled={!data?.rows.length}
            onClick={() =>
              exportCsv(
                "credline-repayments",
                (data?.rows ?? []).map((r) => ({ ...r, amount: r.amount / 100, toPrincipal: r.toPrincipal / 100, toInterest: r.toInterest / 100, toLateFees: r.toLateFees / 100 })),
                [["receivedOn", "Date"], ["reference", "Reference"], ["channel", "Channel"], ["loanReference", "Loan"], ["borrowerName", "Borrower"], ["amount", "Amount (NGN)"], ["toPrincipal", "Principal"], ["toInterest", "Interest"], ["toLateFees", "Late fees"]],
              )
            }
          >
            <Download className="size-3.5" /> Export CSV
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Received, 30 days" value={nairaShort(month)} hint={`${data?.totals.reduce((s, t) => s + t.count, 0) ?? 0} payments`} spark={data?.daily.map((d) => d.amount)} />
        <Kpi label="To principal" value={nairaShort(split.p)} hint="reduces the book" accent="#0f6b4f" />
        <Kpi label="To interest" value={nairaShort(split.i)} hint="income" accent="#2b5fb4" />
        <Kpi label="To late fees" value={nairaShort(split.f)} hint="income" accent="#b4321f" />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHead
            title="Daily receipts"
            meta={shown ? `${date(shown.day)} · ${naira(shown.amount)} from ${shown.count} payments` : "Last 30 days"}
          />
          <div className="flex h-44 items-end gap-1 px-5 pb-5" onMouseLeave={() => setHover(undefined)}>
            {data?.daily.map((d, i) => (
              <div key={d.day} className="flex h-full flex-1 flex-col justify-end" onMouseEnter={() => setHover(i)}>
                <motion.div
                  className={cx("w-full rounded-t-[4px]", hover === i ? "bg-brand" : "bg-brand/30")}
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(1.5, (d.amount / max) * 100)}%` }}
                  transition={{ delay: i * 0.012, duration: 0.5 }}
                />
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">By channel, 30 days</h3>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-ink/[0.06]">
            {data?.totals.map((t) => (
              <div key={t.channel} style={{ width: `${(t.amount / Math.max(month, 1)) * 100}%`, background: CHANNEL[t.channel]?.color }} />
            ))}
          </div>
          <ul className="mt-4 space-y-3 text-sm">
            {data?.totals.map((t) => (
              <li key={t.channel} className="flex items-center gap-3">
                <span className="size-2.5 rounded-[3px]" style={{ background: CHANNEL[t.channel]?.color }} />
                <span className="flex-1">{CHANNEL[t.channel]?.label ?? t.channel}</span>
                <span className="num w-10 text-right text-mute">{t.count}</span>
                <span className="num w-24 text-right font-medium">{naira(t.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 pt-4">
          <Tabs
            value={channel}
            onChange={setChannel}
            options={[
              { value: "ALL", label: "All channels" },
              { value: "CARD_DEBIT", label: "Auto-debit" },
              { value: "CARD", label: "Card" },
              { value: "TRANSFER", label: "Bank transfer" },
            ]}
          />
        </div>
        {!data && <Skeleton className="m-5 h-72" />}
        {data && data.rows.length === 0 && <Empty icon={<HandCoins className="size-5" />} title="No repayments here" />}
        {data && data.rows.length > 0 && (
          <div className="max-h-[600px] overflow-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="sticky top-0 z-10 bg-sheet">
                <tr className="border-b border-line text-left text-[12px] text-mute">
                  <th className="px-5 py-3 font-medium">Received</th>
                  <th className="py-3 font-medium">Borrower</th>
                  <th className="py-3 font-medium">Channel</th>
                  <th className="py-3 text-right font-medium">Amount</th>
                  <th className="py-3 pl-8 font-medium">Applied to</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.rows.map((r) => {
                  const c = CHANNEL[r.channel];
                  const parts = [
                    ["Late fees", r.toLateFees, "#b4321f"],
                    ["Interest", r.toInterest, "#2b5fb4"],
                    ["Principal", r.toPrincipal, "#0f6b4f"],
                  ] as const;
                  return (
                    <tr key={r.id} className="transition hover:bg-paper/70">
                      <td className="px-5 py-3">
                        {date(r.receivedOn)}
                        <span className="block max-w-[220px] truncate font-mono text-[11px] text-mute">{r.reference}</span>
                      </td>
                      <td className="py-3">
                        <Link href={`/console/loans/${r.loanId}`} className="font-medium hover:underline">
                          {r.borrowerName}
                        </Link>
                        <span className="block font-mono text-[12px] text-mute">{r.loanReference}</span>
                      </td>
                      <td className="py-3">
                        {c && <Badge tone={c.tone}>{c.label}</Badge>}
                        {r.recordedBy && <span className="mt-1 block text-[11px] text-mute">by {r.recordedBy}</span>}
                      </td>
                      <td className="num py-3 text-right font-semibold">{naira(r.amount, { kobo: true })}</td>
                      <td className="py-3 pr-5 pl-8">
                        <div className="flex h-2 w-48 overflow-hidden rounded-full bg-ink/[0.06]">
                          {parts.map(([k, v, color]) => (
                            <div key={k} style={{ width: `${(v / r.amount) * 100}%`, background: color }} title={`${k} ${naira(v)}`} />
                          ))}
                        </div>
                        <span className="num mt-1 block text-[11px] text-mute">
                          {parts
                            .filter(([, v]) => v > 0)
                            .map(([k, v]) => `${k.toLowerCase()} ${naira(v)}`)
                            .join(" · ")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
