"use client";

import { Download } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { PageTitle, exportCsv, useConsole } from "@/components/console";
import { Button, Card, CardHead, Meter, Skeleton, cx } from "@/components/ui";
import { useApi } from "@/lib/api";
import { BUCKETS, date, naira, nairaShort, ratio } from "@/lib/format";

type Reports = {
  today: string;
  vintages: { cohort: string; loans: number; disbursed: number; paidOff: number; ever30: number; ever90: number; writtenOff: number; principalRepaid: number; outstanding: number }[];
  rolls: { fromBucket: string; toBucket: string; count: number }[];
  collections: { week: string; due: number; collected: number; installments: number; onTime: number }[];
  products: { code: string; name: string; loans: number; disbursed: number; outstanding: number; par30: number; interest: number }[];
};

const ORDER = ["CURRENT", "DPD_1_30", "DPD_31_60", "DPD_61_90", "DPD_90_PLUS"];

function heat(value: number, max: number, bad: boolean) {
  if (!value) return "transparent";
  const a = 0.12 + 0.6 * Math.min(1, value / Math.max(max, 1e-9));
  return bad ? `rgb(180 50 31 / ${a})` : `rgb(15 107 79 / ${a})`;
}

function monthLabel(c: string) {
  const [y, m] = c.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export default function ReportsPage() {
  const { tick } = useConsole();
  const { data } = useApi<Reports>(`/console/reports?t=${tick}`);
  const [hover, setHover] = useState<number>();
  if (!data) return <Skeleton className="h-[700px]" />;

  const matrix = ORDER.map((from) => ORDER.map((to) => data.rolls.find((r) => r.fromBucket === from && r.toBucket === to)?.count ?? 0));
  const maxRoll = Math.max(...matrix.flat(), 1);
  const maxWeek = Math.max(...data.collections.map((c) => c.due), 1);
  const shown = hover !== undefined ? data.collections[hover] : undefined;
  const maxEver30 = Math.max(...data.vintages.map((v) => v.ever30 / Math.max(v.loans, 1)), 0.01);

  return (
    <div>
      <PageTitle
        title="Reports"
        meta={`Portfolio quality and collections, as at ${date(data.today)}`}
        action={
          <Button
            tone="secondary"
            size="sm"
            onClick={() =>
              exportCsv(
                "credline-vintages",
                data.vintages.map((v) => ({ ...v, disbursed: v.disbursed / 100, principalRepaid: v.principalRepaid / 100, outstanding: v.outstanding / 100 })),
                [["cohort", "Cohort"], ["loans", "Loans"], ["disbursed", "Disbursed (NGN)"], ["paidOff", "Paid off"], ["ever30", "Ever 30+ DPD"], ["ever90", "Ever 90+ DPD"], ["writtenOff", "Written off"], ["principalRepaid", "Principal repaid"], ["outstanding", "Outstanding"]],
              )
            }
          >
            <Download className="size-3.5" /> Vintages CSV
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <CardHead title="Vintage analysis" meta="Each month's disbursements, followed to today. Shaded cells show how bad the cohort got." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-y border-line text-left text-[12px] text-mute">
                <th className="px-5 py-2.5 font-medium">Cohort</th>
                <th className="py-2.5 text-right font-medium">Loans</th>
                <th className="py-2.5 text-right font-medium">Disbursed</th>
                <th className="py-2.5 pl-6 font-medium">Principal repaid</th>
                <th className="py-2.5 text-right font-medium">Paid off</th>
                <th className="py-2.5 text-right font-medium">Ever 30+</th>
                <th className="py-2.5 text-right font-medium">Ever 90+</th>
                <th className="px-5 py-2.5 text-right font-medium">Written off</th>
              </tr>
            </thead>
            <tbody className="num divide-y divide-line">
              {data.vintages.map((v, i) => {
                const e30 = v.ever30 / Math.max(v.loans, 1);
                return (
                  <motion.tr key={v.cohort} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}>
                    <td className="px-5 py-3 font-medium">{monthLabel(v.cohort)}</td>
                    <td className="py-3 text-right">{v.loans}</td>
                    <td className="py-3 text-right">{nairaShort(v.disbursed)}</td>
                    <td className="py-3 pl-6">
                      <div className="flex items-center gap-2">
                        <Meter value={v.principalRepaid} max={v.disbursed} className="w-28" />
                        <span className="text-[12px] text-mute">{ratio(v.principalRepaid, v.disbursed, 0)}</span>
                      </div>
                    </td>
                    <td className="py-3 text-right">{ratio(v.paidOff, v.loans, 0)}</td>
                    <td className="py-3 text-right">
                      <span className="rounded-md px-2 py-1" style={{ background: heat(e30, maxEver30, true) }}>
                        {ratio(v.ever30, v.loans, 1)}
                      </span>
                    </td>
                    <td className="py-3 text-right">{ratio(v.ever90, v.loans, 1)}</td>
                    <td className={cx("px-5 py-3 text-right", v.writtenOff > 0 && "font-semibold text-bad")}>{v.writtenOff}</td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHead title="Bucket movements, 90 days" meta="Rows are where loans came from, columns where they went. Green cures, red rolls forward." />
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full min-w-[480px] text-[13px]">
              <thead>
                <tr>
                  <th className="pb-2 text-left text-[11px] font-medium text-mute">from \ to</th>
                  {ORDER.map((b) => (
                    <th key={b} className="pb-2 text-center text-[11px] font-medium text-mute">
                      {BUCKETS[b].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ORDER.map((from, i) => (
                  <tr key={from}>
                    <td className="py-1 pr-3 text-[12px] font-medium whitespace-nowrap">
                      <span className="mr-2 inline-block size-2 rounded-full" style={{ background: BUCKETS[from].color }} />
                      {BUCKETS[from].label}
                    </td>
                    {ORDER.map((to, j) => {
                      const v = matrix[i][j];
                      return (
                        <td key={to} className="p-1">
                          <div
                            className={cx("num grid h-11 place-items-center rounded-lg font-semibold", i === j ? "bg-ink/[0.04] text-mute" : v ? "text-ink" : "text-mute/50")}
                            style={{ background: i === j ? undefined : heat(v, maxRoll, j > i) }}
                          >
                            {i === j ? "—" : v || "·"}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHead
            title="Collections by due week"
            meta={shown ? `Week of ${date(shown.week)}: ${naira(shown.collected)} of ${naira(shown.due)} collected, ${ratio(shown.onTime, shown.installments, 0)} on time` : "Scheduled versus collected, for instalments due each week"}
          />
          <div className="flex h-56 items-end gap-2 px-5" onMouseLeave={() => setHover(undefined)}>
            {data.collections.map((c, i) => (
              <div key={c.week} className="relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
                <motion.div
                  className={cx("absolute bottom-0 w-full rounded-t-md", hover === i ? "bg-ink/20" : "bg-ink/[0.08]")}
                  initial={{ height: 0 }}
                  animate={{ height: `${(c.due / maxWeek) * 100}%` }}
                  transition={{ delay: i * 0.04, duration: 0.6 }}
                />
                <motion.div
                  className={cx("absolute bottom-0 left-[18%] w-[64%] rounded-t-md", hover === i ? "bg-brand" : "bg-brand/70")}
                  initial={{ height: 0 }}
                  animate={{ height: `${(c.collected / maxWeek) * 100}%` }}
                  transition={{ delay: 0.15 + i * 0.04, duration: 0.6 }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 px-5 pt-2 pb-5 text-[11px] text-mute">
            {data.collections.map((c, i) => (
              <span key={c.week} className="flex-1 text-center">
                {i % 3 === 0 ? date(c.week, true) : ""}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-6 overflow-hidden">
        <CardHead title="Product performance" />
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-line text-left text-[12px] text-mute">
              <th className="px-5 py-2.5 font-medium">Product</th>
              <th className="py-2.5 text-right font-medium">Loans</th>
              <th className="py-2.5 text-right font-medium">Disbursed</th>
              <th className="py-2.5 text-right font-medium">Outstanding</th>
              <th className="py-2.5 text-right font-medium">Interest earned</th>
              <th className="px-5 py-2.5 font-medium">PAR 30</th>
            </tr>
          </thead>
          <tbody className="num divide-y divide-line">
            {data.products.map((p) => (
              <tr key={p.code}>
                <td className="px-5 py-3 font-medium">{p.name}</td>
                <td className="py-3 text-right">{p.loans}</td>
                <td className="py-3 text-right">{nairaShort(p.disbursed)}</td>
                <td className="py-3 text-right">{nairaShort(p.outstanding)}</td>
                <td className="py-3 text-right">{nairaShort(p.interest)}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Meter value={p.par30} max={Math.max(p.outstanding, 1)} color="#b4321f" className="w-32" />
                    <span className="text-[12px]">{ratio(p.par30, p.outstanding)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
