"use client";

import { ArrowRight, CheckCircle2, ChevronDown, CircleSlash, Clock3, CreditCard, Hourglass, Info } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { CountUp } from "@/components/landing/motion";
import { Badge, Button, Card, Notice, Skeleton, cx } from "@/components/ui";
import { ApiError, post, useApi } from "@/lib/api";
import { APP_STATUS, date, dateTime, naira, pct, reason } from "@/lib/format";
import type { Application, Quote } from "@/lib/types";

function ApplicationPage() {
  const { id } = useParams<{ id: string }>();
  const { data: app, error, reload } = useApi<Application>(`/me/applications/${id}`);

  if (error) return <Notice>{error.message}</Notice>;
  if (!app) return <Skeleton className="mt-8 h-96" />;

  const status = APP_STATUS[app.status] ?? { label: app.status, tone: "neutral" as const };
  return (
    <div className="rise pt-6">
      <div className="flex flex-wrap items-center gap-3 text-sm text-mute">
        <Link href="/me" className="hover:text-ink">
          Your account
        </Link>
        <span>/</span>
        <span className="font-mono text-[13px]">{app.reference}</span>
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
      </div>
      {app.status === "APPROVED" && app.offer && <Offer app={app} quote={app.offer} onChange={reload} />}
      {(app.status === "REFERRED" || app.status === "PENDING_CHECKER") && <InReview app={app} />}
      {app.status === "DECLINED" && <Declined app={app} />}
      {app.status === "ACCEPTED" && (
        <Outcome icon={<CheckCircle2 className="size-6" />} tone="good" title="Offer accepted">
          <p>Your loan has been booked and paid out to your bank account.</p>
          {app.loanId && (
            <Button href={`/me/loans/${app.loanId}`} className="mt-6">
              View your loan <ArrowRight className="size-4" />
            </Button>
          )}
        </Outcome>
      )}
      {(app.status === "EXPIRED" || app.status === "REJECTED_BY_BORROWER") && (
        <Outcome icon={<Clock3 className="size-6" />} tone="neutral" title={app.status === "EXPIRED" ? "This offer expired" : "You turned this offer down"}>
          <p>You can apply again whenever you&apos;re ready and get a fresh decision.</p>
          <Button href="/me" className="mt-6">
            Back to your account
          </Button>
        </Outcome>
      )}
    </div>
  );
}

function Outcome({ icon, tone, title, children }: { icon: React.ReactNode; tone: "good" | "bad" | "info" | "neutral"; title: string; children: React.ReactNode }) {
  const ring = { good: "bg-brand-soft text-brand", bad: "bg-bad-soft text-bad", info: "bg-info-soft text-info", neutral: "bg-ink/[0.06] text-ink-2" }[tone];
  return (
    <Card className="mt-6 p-8 sm:p-10">
      <div className={cx("grid size-12 place-items-center rounded-2xl", ring)}>{icon}</div>
      <h1 className="display mt-6 text-[40px] leading-tight">{title}</h1>
      <div className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-2">{children}</div>
    </Card>
  );
}

function Offer({ app, quote, onChange }: { app: Application; quote: Quote; onChange: () => void }) {
  const [busy, setBusy] = useState<"accept" | "reject">();
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const countered = app.offerAmount !== app.amount || app.offerTenor !== app.tenorMonths;
  const notes = app.decision?.reasons.filter((r) => r === "FIRST_LOAN_LIMIT" || r === "AFFORDABILITY") ?? [];

  const accept = async () => {
    setBusy("accept");
    setError(undefined);
    try {
      const res = await post<{ status: string; checkoutUrl?: string; loanId?: number }>(`/me/applications/${app.id}/accept`);
      if (res.checkoutUrl) {
        const url = new URL(res.checkoutUrl, window.location.origin);
        if (url.origin === window.location.origin) router.push(url.pathname);
        else window.location.href = res.checkoutUrl;
      } else if (res.loanId) router.push(`/me/loans/${res.loanId}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
      setBusy(undefined);
    }
  };

  const reject = async () => {
    setBusy("reject");
    await post(`/me/applications/${app.id}/reject`).catch(() => {});
    onChange();
  };

  const facts: [string, string, string?][] = [
    ["Loan amount", naira(quote.principal)],
    ["Upfront fee", naira(quote.fee), `${pct(app.feeBps)} of the loan, deducted at payout`],
    ["Paid into your account", naira(quote.disbursed), `Account ending ${app.accountNumber.slice(-4)}`],
    ["Monthly repayment", naira(quote.installment), `${quote.tenorMonths} payments from ${date(quote.firstDueDate)}`],
    ["Total interest", naira(quote.totalInterest), `${pct(quote.monthlyRateBps)} a month on the reducing balance`],
    ["Total you repay", naira(quote.totalRepayable)],
    ["Annual percentage rate", pct(quote.aprBps), "Interest and fees, per year"],
    ["Late fee", pct(app.lateFeeBps), "Of a missed instalment, once, after a 3-day grace period"],
  ];

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card className="overflow-hidden">
        <div className="relative overflow-hidden bg-ink px-8 pt-8 pb-9 text-sheet">
          <div className="pointer-events-none absolute -top-24 -right-20 size-72 rounded-full bg-brand/50 blur-3xl" />
          <p className="relative text-[12px] font-medium tracking-wide text-lime uppercase">{countered ? "Here’s what we can offer" : "You're approved"}</p>
          <p className="num display relative mt-3 text-[64px] leading-none">
            <CountUp to={quote.principal} format={(v) => naira(v)} />
          </p>
          <p className="relative mt-3 text-sheet/70">
            {app.productName} over {quote.tenorMonths} months · {naira(quote.installment)} a month
          </p>
        </div>
        {notes.length > 0 && (
          <div className="flex gap-3 border-b border-line bg-warn-soft/60 px-8 py-4 text-sm text-ink-2">
            <Info className="mt-0.5 size-4 shrink-0 text-warn" />
            <div>
              You asked for {naira(app.amount)} over {app.tenorMonths} months. {notes.map((n) => reason(n).borrower).join(" ")}
            </div>
          </div>
        )}
        <div className="px-8 py-6">
          <h2 className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Key facts</h2>
          <dl className="mt-3 divide-y divide-line">
            {facts.map(([k, v, hint], i) => (
              <motion.div
                key={k}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.06, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-baseline justify-between gap-6 py-3"
              >
                <dt>
                  <span className="text-[15px]">{k}</span>
                  {hint && <span className="block text-[12px] text-mute">{hint}</span>}
                </dt>
                <dd className="num text-[16px] font-medium">{v}</dd>
              </motion.div>
            ))}
          </dl>
          <button onClick={() => setOpen(!open)} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand">
            Repayment schedule <ChevronDown className={cx("size-4 transition", open && "rotate-180")} />
          </button>
          {open && (
            <table className="rise mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-[12px] text-mute">
                  <th className="py-2 font-medium">#</th>
                  <th className="py-2 font-medium">Due</th>
                  <th className="py-2 text-right font-medium">Principal</th>
                  <th className="py-2 text-right font-medium">Interest</th>
                  <th className="py-2 text-right font-medium">Payment</th>
                </tr>
              </thead>
              <tbody className="num divide-y divide-line">
                {quote.schedule.map((l) => (
                  <tr key={l.seq}>
                    <td className="py-2 text-mute">{l.seq}</td>
                    <td className="py-2">{date(l.dueDate)}</td>
                    <td className="py-2 text-right">{naira(l.principal, { kobo: true })}</td>
                    <td className="py-2 text-right">{naira(l.interest, { kobo: true })}</td>
                    <td className="py-2 text-right font-medium">{naira(l.principal + l.interest, { kobo: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
      <div className="space-y-4">
        <Card className="p-6">
          <div className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
            <CreditCard className="size-5" />
          </div>
          <h3 className="mt-4 font-semibold">Accept and get paid</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-mute">
            Link a debit card for automatic repayments on each due date. We check it with a ₦50 authorisation, then pay the loan out straight away.
          </p>
          {error && (
            <div className="mt-4">
              <Notice>{error}</Notice>
            </div>
          )}
          <Button tone="brand" size="lg" className="mt-5 w-full" onClick={accept} busy={busy === "accept"} disabled={!!busy}>
            Accept offer
          </Button>
          <Button tone="ghost" className="mt-2 w-full" onClick={reject} busy={busy === "reject"} disabled={!!busy}>
            No thanks
          </Button>
        </Card>
        {app.offerExpiresAt && (
          <p className="flex items-center gap-2 px-2 text-[13px] text-mute">
            <Hourglass className="size-3.5" /> Offer open until {dateTime(app.offerExpiresAt)}
          </p>
        )}
      </div>
    </div>
  );
}

function InReview({ app }: { app: Application }) {
  const steps = [
    ["Application received", true],
    ["Automatic credit check", true],
    ["Credit officer review", app.status === "PENDING_CHECKER"],
    [app.status === "PENDING_CHECKER" ? "Manager sign-off" : "Decision", false],
  ] as const;
  return (
    <Outcome icon={<Hourglass className="size-6" />} tone="info" title="A credit officer is reviewing this">
      <p>
        You asked for {naira(app.amount)} over {app.tenorMonths} months. {(app.decision?.reasons ?? []).map((r) => reason(r).borrower).join(" ")}
      </p>
      <ol className="mt-8 space-y-4">
        {steps.map(([label, done], i) => (
          <li key={label} className="flex items-center gap-3">
            <span className={cx("grid size-6 place-items-center rounded-full text-[11px] font-semibold", done ? "bg-brand text-white" : i === steps.findIndex((s) => !s[1]) ? "bg-info text-white" : "bg-ink/[0.07] text-mute")}>
              {done ? <CheckCircle2 className="size-3.5" /> : i + 1}
            </span>
            <span className={done ? "" : "text-mute"}>{label}</span>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-sm text-mute">Most reviews finish within one working day. This page updates when there&apos;s a decision.</p>
    </Outcome>
  );
}

function Declined({ app }: { app: Application }) {
  const reasons = app.decision?.reasons ?? [];
  return (
    <Outcome icon={<CircleSlash className="size-6" />} tone="bad" title="We can't lend to you right now">
      <p>We want you to know exactly why. This decision was based on:</p>
      <ul className="mt-5 space-y-3">
        {reasons.map((r) => (
          <li key={r} className="flex gap-3 rounded-xl bg-paper px-4 py-3">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-bad" />
            <span>
              <span className="block font-medium text-ink">{reason(r).label}</span>
              <span className="text-sm text-mute">{reason(r).borrower}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-mute">
        A decline doesn&apos;t affect your credit score with us. If something on your credit report looks wrong, you can dispute it with the bureau and apply again.
      </p>
      <Button href="/me" tone="secondary" className="mt-6">
        Back to your account
      </Button>
    </Outcome>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ApplicationPage />
    </Suspense>
  );
}
