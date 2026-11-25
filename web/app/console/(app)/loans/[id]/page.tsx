"use client";

import { ArrowLeft, Ban, CreditCard, Landmark, Receipt } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuditTimeline, describe } from "@/components/audit";
import { useConsole } from "@/components/console";
import { RepaymentList, ScheduleTable } from "@/components/loan";
import { Badge, Button, Card, CardHead, Dialog, Field, Input, Meter, Notice, Segmented, Skeleton, Textarea, cx } from "@/components/ui";
import { ApiError, post, useApi } from "@/lib/api";
import { BANKS, BUCKETS, LOAN_STATUS, brand, date, naira, pct, title } from "@/lib/format";
import type { Loan } from "@/lib/types";

function LoanDetail() {
  const { id } = useParams<{ id: string }>();
  const { session, tick, refresh } = useConsole();
  const { data: loan, error, reload } = useApi<Loan>(`/console/loans/${id}?t=${tick}`);
  const [dialog, setDialog] = useState<"repay" | "writeoff">();
  const [tab, setTab] = useState<"events" | "debits" | "audit">("events");

  if (error) return <Notice>{error.message}</Notice>;
  if (!loan) return <Skeleton className="h-[600px]" />;

  const s = LOAN_STATUS[loan.status];
  const b = BUCKETS[loan.bucket];
  const active = loan.status === "ACTIVE";
  const done = () => {
    setDialog(undefined);
    reload();
    refresh();
  };

  return (
    <div className="rise">
      <Link href="/console/loans" className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
        <ArrowLeft className="size-4" /> Loans
      </Link>
      <div className="mt-3 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="display text-[38px] leading-tight">{loan.borrowerName}</h1>
            {s && (
              <Badge tone={s.tone} dot>
                {s.label}
              </Badge>
            )}
            {active && loan.dpd > 0 && <Badge tone={b.tone}>{loan.dpd} days late</Badge>}
          </div>
          <p className="mt-1 text-sm text-mute">
            <span className="font-mono">{loan.reference}</span> · {loan.productName} ·{" "}
            <Link href={`/console/applications/${loan.applicationId}`} className="hover:text-ink hover:underline">
              {loan.applicationReference}
            </Link>{" "}
            · {loan.borrowerPhone}
          </p>
        </div>
        {active && (
          <div className="flex gap-2">
            {session.role === "MANAGER" && loan.dpd > 90 && (
              <Button tone="secondary" onClick={() => setDialog("writeoff")}>
                <Ban className="size-4" /> Write off
              </Button>
            )}
            <Button onClick={() => setDialog("repay")}>
              <Receipt className="size-4" /> Record transfer
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Principal", naira(loan.principal), `${loan.tenorMonths} × ${naira(loan.installmentAmount)}`],
          ["Outstanding", naira(active ? loan.outstandingPrincipal : 0), loan.writtenOffAmount ? `${naira(loan.writtenOffAmount)} written off` : "principal"],
          ["Overdue", naira(loan.overdue), loan.feesPaid ? `${naira(loan.feesPaid)} late fees paid` : "incl. late fees"],
          ["Payoff today", naira(loan.payoff), loan.interestWaived ? `${naira(loan.interestWaived)} interest waived` : "current month's interest only"],
          ["Pricing", pct(loan.monthlyRateBps) + "/mo", `APR ${pct(loan.aprBps)} · fee ${naira(loan.fee)}`],
        ].map(([k, v, h]) => (
          <Card key={k} className="p-5">
            <p className="text-[13px] text-mute">{k}</p>
            <p className={cx("num mt-1 text-[22px] font-semibold tracking-tight", k === "Overdue" && loan.overdue > 0 && "text-bad")}>{v}</p>
            <p className="mt-0.5 text-[12px] text-mute">{h}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHead
              title="Schedule"
              meta={loan.disbursedOn ? `Disbursed ${date(loan.disbursedOn)} · matures ${date(loan.maturityDate)}` : "Not disbursed"}
              action={
                <div className="w-40 pt-1">
                  <Meter value={loan.principalPaid} max={loan.principal} />
                  <p className="mt-1 text-right text-[11px] text-mute">{Math.round((loan.principalPaid / loan.principal) * 100)}% of principal repaid</p>
                </div>
              }
            />
            <ScheduleTable rows={loan.schedule} />
          </Card>
          <Card>
            <CardHead title="Repayments" meta={`${naira(loan.principalPaid + loan.interestPaid + loan.feesPaid)} received`} />
            <RepaymentList rows={loan.repayments} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Money in and out</h3>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-paper text-mute">
                  <Landmark className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    Paid out {naira(loan.disbursedAmount)} to {BANKS[loan.bankCode ?? ""] ?? loan.bankCode} {loan.accountNumber}
                  </p>
                  <p className="truncate text-[12px] text-mute">
                    <span className="font-mono">{loan.disbursementReference}</span> · {title(loan.disbursementStatus)}
                    {loan.disbursementFailure ? ` · ${loan.disbursementFailure}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-paper text-mute">
                  <CreditCard className="size-4" />
                </span>
                <div>
                  <p className="font-medium">
                    Auto-debit from {brand(loan.cardType)} •••• {loan.cardLast4}
                  </p>
                  <p className="text-[12px] text-mute">{loan.cardBank} · retried on days 0, 1, 3, 7, 14, 21, 28, then weekly</p>
                </div>
              </div>
            </div>
          </Card>
          <Card>
            <div className="px-5 pt-4">
              <Segmented
                value={tab}
                onChange={setTab}
                className="w-full [&>button]:flex-1"
                options={[
                  { value: "events", label: "Events" },
                  { value: "debits", label: `Debits ${loan.debits?.length ? `(${loan.debits.length})` : ""}` },
                  { value: "audit", label: "Audit" },
                ]}
              />
            </div>
            <div className="max-h-[560px] overflow-y-auto p-5">
              {tab === "events" && (
                <ul className="space-y-3">
                  {loan.events?.map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{title(e.type)}</p>
                        <p className="text-[12px] break-words text-mute">
                          {date(e.businessDate)}
                          {describe(e.detail) ? ` · ${describe(e.detail)}` : ""}
                        </p>
                      </div>
                      {e.amount != null && (
                        <span className={cx("num shrink-0 font-medium", e.type === "LATE_FEE" || e.type === "DEBIT_FAILED" ? "text-bad" : e.type === "REPAYMENT" ? "text-brand" : "")}>
                          {naira(e.amount)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {tab === "debits" &&
                (loan.debits?.length ? (
                  <ul className="space-y-3">
                    {loan.debits.map((d) => (
                      <li key={d.reference} className="flex items-center justify-between gap-3 text-sm">
                        <div>
                          <p className="font-medium">{date(d.businessDate)}</p>
                          <p className="text-[12px] text-mute">{d.failureReason ?? <span className="font-mono">{d.reference}</span>}</p>
                        </div>
                        <div className="text-right">
                          <p className="num font-medium">{naira(d.amount)}</p>
                          <Badge tone={d.status === "SUCCESS" ? "good" : d.status === "FAILED" ? "bad" : "info"}>{title(d.status)}</Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-mute">No debit attempts yet.</p>
                ))}
              {tab === "audit" && <AuditTimeline rows={loan.audit ?? []} />}
            </div>
          </Card>
        </div>
      </div>

      {dialog === "repay" && <RepayDialog loan={loan} onClose={() => setDialog(undefined)} onDone={done} />}
      {dialog === "writeoff" && <WriteOffDialog loan={loan} onClose={() => setDialog(undefined)} onDone={done} />}
    </div>
  );
}

function RepayDialog({ loan, onClose, onDone }: { loan: Loan; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(String((loan.overdue || loan.nextDue?.amount || 0) / 100));
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await post(`/console/loans/${loan.id}/repayments`, { amount: Math.round(Number(amount) * 100), reference });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed");
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title="Record a bank transfer">
      <div className="space-y-4">
        <Field label="Amount received (₦)" hint={`Overdue ${naira(loan.overdue)} · payoff ${naira(loan.payoff)}`}>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoFocus />
        </Field>
        <Field label="NIP session ID or bank reference" hint="Recording the same reference twice is ignored">
          <Input value={reference} onChange={(e) => setReference(e.target.value.replace(/[^A-Za-z0-9-]/g, ""))} placeholder="100004251125093012345678" />
        </Field>
        {error && <Notice>{error}</Notice>}
        <Button size="lg" className="w-full" onClick={submit} busy={busy} disabled={reference.length < 6 || !Number(amount)}>
          Apply payment
        </Button>
      </div>
    </Dialog>
  );
}

function WriteOffDialog({ loan, onClose, onDone }: { loan: Loan; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async () => {
    setBusy(true);
    try {
      await post(`/console/loans/${loan.id}/write-off`, { note });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed");
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title="Write off loan">
      <p className="text-sm text-ink-2">
        Moves <strong className="num">{naira(loan.outstandingPrincipal)}</strong> of principal out of the active book and closes the loan. Only loans over 90 days past due qualify.
      </p>
      <Field label="Note" className="mt-4">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Collection attempts made" />
      </Field>
      {error && (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      )}
      <Button tone="danger" size="lg" className="mt-4 w-full" onClick={submit} busy={busy}>
        Write off
      </Button>
    </Dialog>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LoanDetail />
    </Suspense>
  );
}
