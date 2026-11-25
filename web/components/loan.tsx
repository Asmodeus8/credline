"use client";

import { Badge, cx } from "@/components/ui";
import { INSTALMENT_STATUS, date, naira, title } from "@/lib/format";
import type { Instalment, Repayment } from "@/lib/types";

export function ScheduleTable({ rows }: { rows: Instalment[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[12px] text-mute">
            <th className="px-5 py-2.5 font-medium">#</th>
            <th className="py-2.5 font-medium">Due</th>
            <th className="py-2.5 pl-4 text-right font-medium">Principal</th>
            <th className="py-2.5 pl-4 text-right font-medium">Interest</th>
            <th className="py-2.5 pl-4 text-right font-medium">Late fee</th>
            <th className="py-2.5 pl-4 text-right font-medium">Paid</th>
            <th className="py-2.5 pl-4 text-right font-medium">Left</th>
            <th className="px-5 py-2.5 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="num divide-y divide-line">
          {rows.map((r) => {
            const s = INSTALMENT_STATUS[r.status] ?? { label: r.status, tone: "neutral" as const };
            const paid = r.principalPaid + r.interestPaid + r.lateFeePaid;
            return (
              <tr key={r.id} className={cx(r.status === "OVERDUE" && "bg-bad-soft/40")}>
                <td className="px-5 py-3 text-mute">{r.seq}</td>
                <td className="py-3">
                  {date(r.dueDate)}
                  {r.paidOn && <span className="block text-[11px] text-mute">paid {date(r.paidOn, true)}</span>}
                </td>
                <td className="py-3 pl-4 text-right">{naira(r.principalDue, { kobo: true })}</td>
                <td className="py-3 pl-4 text-right">
                  {naira(r.interestDue - r.interestWaived, { kobo: true })}
                  {r.interestWaived > 0 && <span className="block text-[11px] text-brand">{naira(r.interestWaived)} waived</span>}
                </td>
                <td className={cx("py-3 pl-4 text-right", r.lateFeeDue > 0 ? "text-bad" : "text-mute")}>{r.lateFeeDue > 0 ? naira(r.lateFeeDue, { kobo: true }) : "—"}</td>
                <td className="py-3 pl-4 text-right">{paid > 0 ? naira(paid, { kobo: true }) : <span className="text-mute">{"—"}</span>}</td>
                <td className="py-3 pl-4 text-right font-medium">{r.outstanding > 0 ? naira(r.outstanding, { kobo: true }) : <span className="text-mute">{"—"}</span>}</td>
                <td className="px-5 py-3 text-right">
                  <Badge tone={s.tone}>{s.label}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const CHANNEL: Record<string, string> = { CARD_DEBIT: "Auto-debit", CARD: "Card payment", TRANSFER: "Bank transfer" };

export function RepaymentList({ rows }: { rows: Repayment[] }) {
  if (!rows.length) return <p className="px-5 pb-5 text-sm text-mute">No payments yet.</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium">{CHANNEL[r.channel] ?? title(r.channel)}</p>
            <p className="truncate text-[12px] text-mute">
              {date(r.receivedOn)} · <span className="font-mono">{r.reference}</span>
              {r.recordedBy ? ` · by ${r.recordedBy}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="num font-semibold">{naira(r.amount, { kobo: true })}</p>
            <p className="num text-[11px] text-mute">
              {[r.toLateFees && `fees ${naira(r.toLateFees)}`, r.toInterest && `int ${naira(r.toInterest)}`, r.toPrincipal && `prin ${naira(r.toPrincipal)}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
