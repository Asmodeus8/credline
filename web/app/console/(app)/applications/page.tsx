"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageTitle, ScorePill, useConsole } from "@/components/console";
import { Badge, Card, Empty, Segmented, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/api";
import { APP_STATUS, EMPLOYMENT, date, naira, reason } from "@/lib/format";

type Row = {
  id: number;
  reference: string;
  status: string;
  amount: number;
  tenorMonths: number;
  offerAmount?: number;
  offerTenor?: number;
  purpose: string;
  createdAt: string;
  productName: string;
  borrowerName: string;
  employment: string;
  monthlyIncome: number;
  outcome: string;
  score: number;
  reasons: string[];
  makerName?: string;
};

export default function Applications() {
  const [view, setView] = useState("QUEUE");
  const { tick } = useConsole();
  const { data } = useApi<Row[]>(`/console/applications?view=${view}&t=${tick}`);

  return (
    <div className="rise">
      <PageTitle
        title="Applications"
        meta="Referred files and approvals waiting on a second signature"
        action={
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "QUEUE", label: "Queue" },
              { value: "APPROVED", label: "Approved" },
              { value: "DECLINED", label: "Declined" },
              { value: "ALL", label: "All" },
            ]}
          />
        }
      />
      <Card className="overflow-hidden">
        {!data && <Skeleton className="m-5 h-64" />}
        {data && data.length === 0 && (
          <Empty icon={<Inbox className="size-5" />} title="Nothing waiting">
            New referrals land here when the engine scores a file between 520 and 599, or an offer is above the auto-approval limit.
          </Empty>
        )}
        {data && data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-mute">
                  <th className="px-5 py-3 font-medium">Applicant</th>
                  <th className="py-3 font-medium">Requested</th>
                  <th className="py-3 font-medium">Score</th>
                  <th className="py-3 font-medium">Why</th>
                  <th className="py-3 font-medium">Received</th>
                  <th className="px-5 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.map((r) => {
                  const s = APP_STATUS[r.status];
                  return (
                    <tr key={r.id} className="group cursor-pointer transition hover:bg-paper/70">
                      <td className="px-5 py-3.5">
                        <Link href={`/console/applications/${r.id}`} className="block">
                          <span className="block font-medium group-hover:underline">{r.borrowerName}</span>
                          <span className="block text-[12px] text-mute">
                            {EMPLOYMENT[r.employment]} · {naira(r.monthlyIncome)}/mo
                          </span>
                        </Link>
                      </td>
                      <td className="num py-3.5">
                        <span className="block font-medium">{naira(r.amount)}</span>
                        <span className="block text-[12px] text-mute">
                          {r.productName} · {r.tenorMonths} mo
                        </span>
                      </td>
                      <td className="py-3.5">
                        <ScorePill score={r.score} />
                      </td>
                      <td className="py-3.5">
                        <div className="flex max-w-xs flex-wrap gap-1">
                          {r.reasons.slice(0, 2).map((x) => (
                            <span key={x} className="rounded-md bg-ink/[0.05] px-1.5 py-0.5 text-[11px] text-ink-2">
                              {reason(x).label}
                            </span>
                          ))}
                          {r.reasons.length > 2 && <span className="text-[11px] text-mute">+{r.reasons.length - 2}</span>}
                        </div>
                      </td>
                      <td className="py-3.5 text-mute">{date(r.createdAt)}</td>
                      <td className="px-5 py-3.5 text-right">
                        {s && <Badge tone={s.tone}>{s.label}</Badge>}
                        {r.status === "PENDING_CHECKER" && r.makerName && <span className="mt-1 block text-[11px] text-mute">proposed by {r.makerName}</span>}
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
