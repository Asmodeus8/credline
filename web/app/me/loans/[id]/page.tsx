"use client";

import { CheckCircle2, PartyPopper } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { RepaymentList, ScheduleTable } from "@/components/loan";
import { PayDialog } from "@/components/pay";
import { Badge, Button, Card, CardHead, Meter, Notice, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/api";
import { BANKS, LOAN_STATUS, date, naira, pct } from "@/lib/format";
import type { Loan } from "@/lib/types";

export default function LoanPage() {
  return (
    <Suspense fallback={<Skeleton className="mt-8 h-96" />}>
      <LoanView />
    </Suspense>
  );
}

function LoanView() {
  const { id } = useParams<{ id: string }>();
  const fresh = useSearchParams().get("new") === "1";
  const { data: loan, error, reload } = useApi<Loan>(`/me/loans/${id}`);
  const [paying, setPaying] = useState(false);

  if (error) return <Notice>{error.message}</Notice>;
  if (!loan) return <Skeleton className="mt-8 h-96" />;

  const status = LOAN_STATUS[loan.status];
  const paidTotal = loan.principalPaid + loan.interestPaid + loan.feesPaid;
  return (
    <div className="rise pt-6">
      <div className="flex flex-wrap items-center gap-3 text-sm text-mute">
        <Link href="/me" className="hover:text-ink">
          Your account
        </Link>
        <span>/</span>
        <span className="font-mono text-[13px]">{loan.reference}</span>
        {status && (
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
        )}
      </div>

      {fresh && loan.status === "ACTIVE" && (
        <div className="mt-6 flex items-center gap-4 rounded-[18px] bg-brand-soft px-6 py-5 text-brand-2">
          <PartyPopper className="size-6 shrink-0" />
          <p>
            <strong className="num">{naira(loan.disbursedAmount)}</strong> is on its way to your {BANKS[loan.bankCode ?? ""] ?? "bank"} account ending{" "}
            {loan.accountNumber?.slice(-4)}.
          </p>
        </div>
      )}
      {loan.status === "PAID_OFF" && (
        <div className="mt-6 flex items-center gap-4 rounded-[18px] bg-brand-soft px-6 py-5 text-brand-2">
          <CheckCircle2 className="size-6 shrink-0" />
          <p>Paid off on {date(loan.closedOn)}. Your next application will be scored on this history.</p>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Borrowed", naira(loan.principal), `${loan.tenorMonths} months at ${pct(loan.monthlyRateBps)}/mo`],
          ["Repaid so far", naira(paidTotal), `${naira(loan.principalPaid)} of principal`],
          ["Still owed", naira(loan.status === "ACTIVE" ? loan.outstandingPrincipal : 0), "principal"],
          ["To close today", naira(loan.payoff), "future interest waived"],
        ].map(([k, v, h]) => (
          <Card key={k} className="p-5">
            <p className="text-[13px] text-mute">{k}</p>
            <p className="num mt-1 text-[24px] font-semibold tracking-tight">{v}</p>
            <p className="mt-0.5 text-[12px] text-mute">{h}</p>
          </Card>
        ))}
      </div>

      {loan.status === "ACTIVE" && (
        <Card className="mt-4 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <Meter value={loan.principalPaid} max={loan.principal} />
            <p className="mt-2 text-[13px] text-mute">
              {loan.overdue > 0 ? (
                <span className="text-bad">
                  {naira(loan.overdue)} overdue · {loan.dpd} days late
                </span>
              ) : loan.nextDue ? (
                <>
                  Next: {naira(loan.nextDue.amount)} on {date(loan.nextDue.dueDate)}, debited from •••• {loan.cardLast4}
                </>
              ) : null}
            </p>
          </div>
          <Button onClick={() => setPaying(true)}>Make a payment</Button>
        </Card>
      )}

      <Card className="mt-6">
        <CardHead title="Schedule" meta={`Matures ${date(loan.maturityDate)}`} />
        <ScheduleTable rows={loan.schedule} />
      </Card>
      <Card className="mt-6">
        <CardHead title="Payments" />
        <RepaymentList rows={loan.repayments} />
      </Card>

      {paying && <PayDialog loan={loan} open onClose={() => setPaying(false)} onPaid={reload} />}
    </div>
  );
}
