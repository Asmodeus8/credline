"use client";

import { Banknote } from "lucide-react";
import Link from "next/link";
import { PageTitle, Kpi, useConsole } from "@/components/console";
import { Badge, Card, CardHead, Empty, Skeleton, cx } from "@/components/ui";
import { useApi } from "@/lib/api";
import { brand, date, naira, ratio } from "@/lib/format";

type Day = {
  businessDate: string;
  status: string;
  debitsAttempted: number;
  debitsSucceeded: number;
  lateFeesCharged: number;
  bucketChanges: number;
  offersExpired: number;
};

type Collections = {
  date: string;
  day?: Day;
  recentDays: Day[];
  attempts: { reference: string; amount: number; status: string; failureReason?: string; loanId: number; loanReference: string; dpd: number; borrowerName: string; cardType: string; last4: string }[];
  upcoming: { dueDate: string; installments: number; amount: number }[];
};

export default function CollectionsPage() {
  const { tick, today } = useConsole();
  const { data } = useApi<Collections>(today ? `/console/collections?t=${tick}` : null);

  if (!data) return <Skeleton className="h-[500px]" />;
  const collected = data.attempts.filter((a) => a.status === "SUCCESS").reduce((s, a) => s + a.amount, 0);
  const attempted = data.attempts.reduce((s, a) => s + a.amount, 0);
  const maxUpcoming = Math.max(...data.upcoming.map((u) => u.amount), 1);

  return (
    <div className="rise">
      <PageTitle title="Collections" meta={`Card debits run at the end of each business day · ${date(data.date)}`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Debits today" value={`${data.day?.debitsSucceeded ?? 0} / ${data.day?.debitsAttempted ?? 0}`} hint={data.day ? "succeeded / attempted" : "end of day not run yet"} />
        <Kpi label="Collected today" value={naira(collected)} hint={`${ratio(collected, attempted, 0)} of ${naira(attempted)} attempted`} accent="#0f6b4f" />
        <Kpi label="Late fees charged" value={data.day?.lateFeesCharged ?? 0} hint="after the 3-day grace period" accent="#b4321f" />
        <Kpi label="Bucket moves" value={data.day?.bucketChanges ?? 0} hint={`${data.day?.offersExpired ?? 0} offers expired`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card className="overflow-hidden">
          <CardHead title="Today's debit attempts" />
          {data.attempts.length === 0 ? (
            <Empty icon={<Banknote className="size-5" />} title="No debits today">
              Advance the business date to run collections on the next due dates.
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-y border-line text-left text-[12px] text-mute">
                    <th className="px-5 py-2.5 font-medium">Borrower</th>
                    <th className="py-2.5 font-medium">Card</th>
                    <th className="py-2.5 text-right font-medium">Amount</th>
                    <th className="px-5 py-2.5 text-right font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.attempts.map((a) => (
                    <tr key={a.reference} className="hover:bg-paper/70">
                      <td className="px-5 py-3">
                        <Link href={`/console/loans/${a.loanId}`} className="font-medium hover:underline">
                          {a.borrowerName}
                        </Link>
                        <span className="block font-mono text-[12px] text-mute">{a.loanReference}</span>
                      </td>
                      <td className="py-3 text-mute">
                        {brand(a.cardType)} •••• {a.last4}
                      </td>
                      <td className="num py-3 text-right font-medium">{naira(a.amount)}</td>
                      <td className="px-5 py-3 text-right">
                        <Badge tone={a.status === "SUCCESS" ? "good" : a.status === "FAILED" ? "bad" : "info"}>
                          {a.status === "SUCCESS" ? "Collected" : a.status === "FAILED" ? (a.failureReason ?? "Failed") : "Pending"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHead title="Due in the next 14 days" />
            <div className="space-y-2 px-5 pb-5">
              {data.upcoming.length === 0 && <p className="text-sm text-mute">Nothing due.</p>}
              {data.upcoming.map((u) => (
                <div key={u.dueDate} className="flex items-center gap-3 text-sm">
                  <span className="w-16 shrink-0 text-mute">{date(u.dueDate, true)}</span>
                  <div className="h-6 flex-1 overflow-hidden rounded-md bg-ink/[0.05]">
                    <div className="flex h-full items-center rounded-md bg-brand/80 px-2 text-[11px] font-medium text-white" style={{ width: `${Math.max(12, (u.amount / maxUpcoming) * 100)}%` }}>
                      {u.installments}
                    </div>
                  </div>
                  <span className="num w-24 shrink-0 text-right font-medium">{naira(u.amount)}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHead title="Recent business days" />
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-line text-left text-[12px] text-mute">
                  <th className="px-5 py-2 font-medium">Date</th>
                  <th className="py-2 text-right font-medium">Debits</th>
                  <th className="py-2 text-right font-medium">Fees</th>
                  <th className="px-5 py-2 text-right font-medium">Moves</th>
                </tr>
              </thead>
              <tbody className="num divide-y divide-line">
                {data.recentDays.map((d) => (
                  <tr key={d.businessDate}>
                    <td className="px-5 py-2.5">{date(d.businessDate)}</td>
                    <td className="py-2.5 text-right">
                      <span className={cx(d.debitsSucceeded < d.debitsAttempted && "text-warn")}>
                        {d.debitsSucceeded}/{d.debitsAttempted}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">{d.lateFeesCharged}</td>
                    <td className="px-5 py-2.5 text-right">{d.bucketChanges}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </div>
  );
}
