"use client";

import { CheckCircle2, Clock3, Download, Send, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Kpi, PageTitle, Tabs, exportCsv, useConsole } from "@/components/console";
import { Badge, Button, Card, Empty, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/api";
import { BANKS, dateTime, naira, nairaShort } from "@/lib/format";

type Data = {
  totals: { status: string; count: number; amount: number }[];
  rows: {
    reference: string;
    amount: number;
    bankCode: string;
    accountNumber: string;
    status: string;
    failureReason?: string;
    createdAt: string;
    completedAt?: string;
    loanId: number;
    loanReference: string;
    principal: number;
    fee: number;
    productName: string;
    borrowerName: string;
  }[];
};

const STATUS = {
  SUCCESS: { label: "Paid out", tone: "good" as const, icon: CheckCircle2 },
  PENDING: { label: "Pending", tone: "info" as const, icon: Clock3 },
  FAILED: { label: "Failed", tone: "bad" as const, icon: XCircle },
};

export default function Disbursements() {
  const { tick } = useConsole();
  const [status, setStatus] = useState("ALL");
  const { data } = useApi<Data>(`/console/disbursements?status=${status}&t=${tick}`);
  const total = (s: string) => data?.totals.find((t) => t.status === s) ?? { count: 0, amount: 0 };
  const all = data?.totals.reduce((a, t) => a + t.count, 0) ?? 0;

  return (
    <div>
      <PageTitle
        title="Disbursements"
        meta="Every payout to a borrower's bank account, net of the upfront fee"
        action={
          <Button
            tone="secondary"
            size="sm"
            disabled={!data?.rows.length}
            onClick={() =>
              exportCsv(
                "credline-disbursements",
                (data?.rows ?? []).map((r) => ({ ...r, amount: r.amount / 100, bank: BANKS[r.bankCode] ?? r.bankCode })),
                [["reference", "Reference"], ["loanReference", "Loan"], ["borrowerName", "Borrower"], ["amount", "Amount (NGN)"], ["bank", "Bank"], ["accountNumber", "Account"], ["status", "Status"], ["createdAt", "Created"]],
              )
            }
          >
            <Download className="size-3.5" /> Export CSV
          </Button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi label="Paid out" value={nairaShort(total("SUCCESS").amount)} hint={`${total("SUCCESS").count} transfers`} accent="#0f6b4f" />
        <Kpi label="Pending at the provider" value={total("PENDING").count} hint={nairaShort(total("PENDING").amount)} accent="#2b5fb4" />
        <Kpi label="Failed" value={total("FAILED").count} hint={total("FAILED").count ? "account could not be credited" : "none so far"} accent="#b4321f" />
      </div>
      <Card className="overflow-hidden">
        <div className="px-5 pt-4">
          <Tabs
            value={status}
            onChange={setStatus}
            options={[
              { value: "ALL", label: "All", count: all },
              { value: "SUCCESS", label: "Paid out", count: total("SUCCESS").count },
              { value: "PENDING", label: "Pending", count: total("PENDING").count },
              { value: "FAILED", label: "Failed", count: total("FAILED").count },
            ]}
          />
        </div>
        {!data && <Skeleton className="m-5 h-72" />}
        {data && data.rows.length === 0 && <Empty icon={<Send className="size-5" />} title="No payouts here" />}
        {data && data.rows.length > 0 && (
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="sticky top-0 z-10 bg-sheet">
                <tr className="border-b border-line text-left text-[12px] text-mute">
                  <th className="px-5 py-3 font-medium">Borrower</th>
                  <th className="py-3 font-medium">Destination</th>
                  <th className="py-3 text-right font-medium">Loan</th>
                  <th className="py-3 text-right font-medium">Fee</th>
                  <th className="py-3 text-right font-medium">Paid out</th>
                  <th className="py-3 pl-8 font-medium">When</th>
                  <th className="px-5 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.rows.map((r) => {
                  const s = STATUS[r.status as keyof typeof STATUS];
                  return (
                    <tr key={r.reference} className="transition hover:bg-paper/70">
                      <td className="px-5 py-3">
                        <Link href={`/console/loans/${r.loanId}`} className="font-medium hover:underline">
                          {r.borrowerName}
                        </Link>
                        <span className="block font-mono text-[12px] text-mute">{r.reference}</span>
                      </td>
                      <td className="py-3">
                        {BANKS[r.bankCode] ?? r.bankCode}
                        <span className="block font-mono text-[12px] text-mute">{r.accountNumber}</span>
                      </td>
                      <td className="num py-3 text-right">{naira(r.principal)}</td>
                      <td className="num py-3 text-right text-mute">{r.fee ? `−${naira(r.fee)}` : "—"}</td>
                      <td className="num py-3 text-right font-semibold">{naira(r.amount)}</td>
                      <td className="py-3 pl-8 text-mute">{dateTime(r.completedAt ?? r.createdAt)}</td>
                      <td className="px-5 py-3 text-right">
                        {s && (
                          <Badge tone={s.tone} dot>
                            {s.label}
                          </Badge>
                        )}
                        {r.failureReason && <span className="mt-1 block text-[11px] text-bad">{r.failureReason}</span>}
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
