"use client";

import { AlertTriangle, ArrowRight, CalendarClock, CreditCard, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoanPicker, type Pick as LoanPick, QuoteSummary, clampPick, useProducts, useQuote } from "@/components/calculator";
import { PayDialog } from "@/components/pay";
import { Badge, Button, Card, Dialog, Meter, Notice, Skeleton, cx } from "@/components/ui";
import { ApiError, post, useApi } from "@/lib/api";
import { APP_STATUS, BANKS, LOAN_STATUS, date, daysBetween, naira } from "@/lib/format";
import type { Application, Loan } from "@/lib/types";

type Me = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  bankCode: string;
  accountNumber: string;
  today: string;
  applications: (Pick<Application, "id" | "reference" | "status" | "amount" | "tenorMonths" | "offerAmount" | "offerTenor" | "createdAt" | "productName"> & { loanId?: number })[];
  loans: { id: number; reference: string; status: string; principal: number; principalPaid: number; tenorMonths: number; installmentAmount: number; disbursedOn?: string; maturityDate?: string; closedOn?: string; dpd: number; productName: string }[];
  card?: { cardType: string; last4: string; bank: string; expMonth: number; expYear: number };
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function Dashboard() {
  const { data: me, error, reload } = useApi<Me>("/me");
  const active = me?.loans.find((l) => l.status === "ACTIVE" || l.status === "DISBURSING");
  const { data: loan, reload: reloadLoan } = useApi<Loan>(active ? `/me/loans/${active.id}` : null);
  const [paying, setPaying] = useState(false);
  const [applying, setApplying] = useState(false);

  if (error) return <Notice>{error.message}</Notice>;
  if (!me) return <Skeleton className="mt-8 h-96" />;

  const openApp = me.applications.find((a) => ["APPROVED", "REFERRED", "PENDING_CHECKER"].includes(a.status));
  const canApply = !openApp && !active;

  return (
    <div className="rise pt-6">
      <p className="text-sm text-mute">{date(me.today)}</p>
      <h1 className="display mt-1 text-[44px] leading-tight">
        {greeting()}, {me.firstName}
      </h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {openApp && <OpenApplication app={openApp} />}
          {active && loan && <ActiveLoan loan={loan} onPay={() => setPaying(true)} />}
          {active && !loan && <Skeleton className="h-72" />}
          {canApply && (
            <Card className="flex flex-col items-start gap-5 p-8 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-[19px] font-semibold">{me.loans.some((l) => l.status === "PAID_OFF") ? "Ready for your next loan?" : "No loan right now"}</h2>
                <p className="mt-1 text-sm text-mute">Get a decision in under a minute. Your history with us counts towards your score.</p>
              </div>
              <Button onClick={() => setApplying(true)}>
                <Plus className="size-4" /> New loan
              </Button>
            </Card>
          )}

          <Card>
            <div className="px-6 pt-5 pb-2">
              <h2 className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">History</h2>
            </div>
            <ul className="divide-y divide-line">
              {me.applications.map((a) => {
                const s = APP_STATUS[a.status];
                const l = a.loanId ? me.loans.find((x) => x.id === a.loanId) : undefined;
                const ls = l ? LOAN_STATUS[l.status] : undefined;
                return (
                  <li key={a.id}>
                    <Link href={l ? `/me/loans/${l.id}` : `/me/applications/${a.id}`} className="flex items-center gap-4 px-6 py-4 transition hover:bg-paper/70">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper text-mute">
                        <FileText className="size-4.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">
                          {a.productName} · {naira(a.offerAmount ?? a.amount)}
                        </span>
                        <span className="block text-[13px] text-mute">
                          {date(a.createdAt)} · <span className="font-mono text-[12px]">{l?.reference ?? a.reference}</span>
                        </span>
                      </span>
                      {ls ? <Badge tone={ls.tone}>{ls.label}</Badge> : s && <Badge tone={s.tone}>{s.label}</Badge>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Repayment card</h3>
            {me.card ? (
              <div className="mt-4 rounded-2xl bg-gradient-to-br from-ink to-[#23302a] p-5 text-sheet">
                <div className="flex items-center justify-between">
                  <CreditCard className="size-5 text-lime" />
                  <span className="text-[11px] font-semibold tracking-wider uppercase opacity-70">{me.card.cardType}</span>
                </div>
                <p className="mt-8 font-mono tracking-[0.2em]">•••• {me.card.last4}</p>
                <p className="mt-1 text-[12px] opacity-60">
                  {me.card.bank} · {String(me.card.expMonth).padStart(2, "0")}/{String(me.card.expYear).slice(-2)}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-mute">You&apos;ll link a card when you accept your first offer.</p>
            )}
          </Card>
          <Card className="p-5">
            <h3 className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Payout account</h3>
            <p className="mt-3 font-medium">{BANKS[me.bankCode] ?? me.bankCode}</p>
            <p className="font-mono text-sm text-mute">{me.accountNumber}</p>
          </Card>
        </div>
      </div>

      {loan && paying && (
        <PayDialog
          loan={loan}
          open={paying}
          onClose={() => setPaying(false)}
          onPaid={() => {
            reload();
            reloadLoan();
          }}
        />
      )}
      {applying && <NewLoan onClose={() => setApplying(false)} />}
    </div>
  );
}

function OpenApplication({ app }: { app: Me["applications"][number] }) {
  const offer = app.status === "APPROVED";
  return (
    <Link href={`/me/applications/${app.id}`} className="block">
      <div className={cx("relative overflow-hidden rounded-[18px] p-6 transition hover:-translate-y-0.5", offer ? "bg-ink text-sheet" : "border border-line bg-sheet")}>
        {offer && <div className="pointer-events-none absolute -top-20 -right-10 size-64 rounded-full bg-brand/60 blur-3xl" />}
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <p className={cx("text-[12px] font-semibold tracking-wide uppercase", offer ? "text-lime" : "text-info")}>{offer ? "Your offer is ready" : "In review"}</p>
            <p className="num display mt-2 text-[36px] leading-none">{naira(app.offerAmount ?? app.amount)}</p>
            <p className={cx("mt-2 text-sm", offer ? "text-sheet/70" : "text-mute")}>
              {app.productName} · {app.offerTenor ?? app.tenorMonths} months
            </p>
          </div>
          <span className={cx("grid size-11 place-items-center rounded-full", offer ? "bg-lime text-ink" : "bg-paper")}>
            <ArrowRight className="size-5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function ActiveLoan({ loan, onPay }: { loan: Loan; onPay: () => void }) {
  const repaid = loan.principalPaid / loan.principal;
  const paidCount = loan.schedule.filter((s) => s.status === "PAID").length;
  const days = loan.nextDue ? daysBetween(loan.today, loan.nextDue.dueDate) : 0;
  return (
    <Card className="overflow-hidden">
      {loan.overdue > 0 && (
        <div className="flex items-center gap-3 bg-bad-soft px-6 py-3 text-sm text-bad">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            <strong className="num">{naira(loan.overdue)}</strong> is overdue{loan.dpd > 0 ? ` by ${loan.dpd} days` : ""}. Paying now stops further late fees.
          </span>
        </div>
      )}
      <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-end sm:p-8">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-mute">{loan.productName}</span>
            <span className="font-mono text-[12px] text-mute">{loan.reference}</span>
          </div>
          {loan.status === "DISBURSING" ? (
            <p className="display mt-3 text-[34px]">Paying out {naira(loan.disbursedAmount)}…</p>
          ) : (
            <>
              <p className="mt-4 text-[13px] font-medium text-ink-2">{loan.overdue > 0 ? "Due now" : "Next payment"}</p>
              <p className="num display text-[52px] leading-none">{naira(loan.overdue > 0 ? loan.overdue : loan.nextDue?.amount)}</p>
              {loan.nextDue && loan.overdue === 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-mute">
                  <CalendarClock className="size-4" /> {date(loan.nextDue.dueDate)} · {days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`} · auto-debit from •••• {loan.cardLast4}
                </p>
              )}
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button tone="secondary" href={`/me/loans/${loan.id}`}>
            Details
          </Button>
          <Button onClick={onPay} disabled={loan.status !== "ACTIVE"}>
            Pay now
          </Button>
        </div>
      </div>
      <div className="border-t border-line px-6 py-5 sm:px-8">
        <div className="flex justify-between text-[13px]">
          <span className="text-mute">
            {paidCount} of {loan.tenorMonths} paid
          </span>
          <span className="num font-medium">
            {naira(loan.principalPaid)} <span className="text-mute">of {naira(loan.principal)}</span>
          </span>
        </div>
        <Meter value={repaid} max={1} className="mt-2.5" />
      </div>
    </Card>
  );
}

function NewLoan({ onClose }: { onClose: () => void }) {
  const products = useProducts();
  const [chosen, setPick] = useState<LoanPick>();
  const pick = chosen ?? (products?.length ? clampPick(products.find((p) => p.code === "SALARY") ?? products[0], { amount: 20_000_000, tenor: 6 }) : undefined);
  const quote = useQuote(pick);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const router = useRouter();

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const app = await post<Application>("/me/applications", { ...pick, purpose: "Repeat loan" });
      router.push(`/me/applications/${app.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="New loan" width="max-w-2xl">
      {products && pick ? (
        <div className="grid gap-6 sm:grid-cols-[1fr_240px]">
          <LoanPicker products={products} pick={pick} onChange={setPick} />
          <div className="rounded-2xl bg-paper p-4">
            <QuoteSummary quote={quote} />
          </div>
          {error && (
            <div className="sm:col-span-2">
              <Notice>{error}</Notice>
            </div>
          )}
          <Button size="lg" className="sm:col-span-2" onClick={submit} busy={busy}>
            Get my decision
          </Button>
        </div>
      ) : (
        <Skeleton className="h-64" />
      )}
    </Dialog>
  );
}
