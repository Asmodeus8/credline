"use client";

import { ArrowLeft, Check, ShieldAlert, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuditTimeline } from "@/components/audit";
import { ScorePill, useConsole } from "@/components/console";
import { Badge, Button, Card, CardHead, Dialog, Field, Input, Meter, Notice, Skeleton, Textarea, cx } from "@/components/ui";
import { ApiError, post, useApi } from "@/lib/api";
import { APP_STATUS, BANKS, EMPLOYMENT, RULES, date, naira, pct, reason } from "@/lib/format";
import type { Application } from "@/lib/types";

const THRESHOLD = 30_000_000;

function ApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const { session, refresh, tick } = useConsole();
  const { data: app, error, reload } = useApi<Application>(`/console/applications/${id}?t=${tick}`);
  const [dialog, setDialog] = useState<"approve" | "decline">();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string>();

  if (error) return <Notice>{error.message}</Notice>;
  if (!app) return <Skeleton className="h-[600px]" />;

  const d = app.decision!;
  const b = d.breakdown!;
  const status = APP_STATUS[app.status];
  const isMaker = app.makerName === session.name;
  const canConfirm = app.status === "PENDING_CHECKER" && session.role === "MANAGER" && !isMaker;

  const confirm = async () => {
    setBusy(true);
    setActionError(undefined);
    try {
      await post(`/console/applications/${app.id}/confirm`);
      reload();
      refresh();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const min = 300;
  const max = 820;
  const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`;

  return (
    <div className="rise">
      <Link href="/console/applications" className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
        <ArrowLeft className="size-4" /> Applications
      </Link>
      <div className="mt-3 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="display text-[38px] leading-tight">{app.borrowerName}</h1>
            {status && (
              <Badge tone={status.tone} dot>
                {status.label}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-mute">
            <span className="font-mono">{app.reference}</span> · {app.productName} · received {date(app.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {app.status === "REFERRED" && (
            <>
              <Button tone="secondary" onClick={() => setDialog("decline")}>
                <X className="size-4" /> Decline
              </Button>
              <Button tone="brand" onClick={() => setDialog("approve")}>
                <Check className="size-4" /> Approve
              </Button>
            </>
          )}
          {app.status === "PENDING_CHECKER" && (
            <>
              <Button tone="secondary" onClick={() => setDialog("decline")}>
                <X className="size-4" /> Decline
              </Button>
              <Button tone="brand" onClick={confirm} busy={busy} disabled={!canConfirm}>
                <Check className="size-4" /> Confirm approval
              </Button>
            </>
          )}
          {app.loanId && (
            <Button href={`/console/loans/${app.loanId}`} tone="secondary">
              Open loan {app.loanReference}
            </Button>
          )}
        </div>
      </div>

      {app.status === "PENDING_CHECKER" && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-warn/20 bg-warn-soft px-5 py-4 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <div>
            <strong>{app.makerName}</strong> proposed {naira(app.offerAmount)} over {app.offerTenor} months. Offers above {naira(THRESHOLD)} need a manager who
            didn&apos;t propose them.
            {!canConfirm && <span className="text-mute"> {isMaker ? "You proposed this one." : session.role !== "MANAGER" ? "Sign in as a manager to confirm." : ""}</span>}
            {app.reviewNote && <p className="mt-1 text-ink-2">&ldquo;{app.reviewNote}&rdquo;</p>}
          </div>
        </div>
      )}
      {actionError && (
        <div className="mb-6">
          <Notice>{actionError}</Notice>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHead title="Credit decision" meta={`Policy ${d.policyVersion} · engine said ${b.engineOutcome.toLowerCase()}`} action={<ScorePill score={d.score ?? 0} large />} />
            <div className="px-5 pb-6">
              <div className="relative mt-4 h-3 rounded-full" style={{ background: "linear-gradient(90deg,#b4321f 0%,#b4321f 43%,#2b5fb4 43%,#2b5fb4 58%,#0f6b4f 58%)" }}>
                <span className="absolute -top-1.5 h-6 w-1.5 -translate-x-1/2 rounded-full bg-ink ring-4 ring-sheet" style={{ left: pos(d.score ?? min) }} />
              </div>
              <div className="relative mt-2 h-4 text-[11px] text-mute">
                <span className="absolute left-0">{min}</span>
                <span className="absolute -translate-x-1/2" style={{ left: pos(b.cutoffs.refer) }}>
                  {b.cutoffs.refer} refer
                </span>
                <span className="absolute -translate-x-1/2" style={{ left: pos(b.cutoffs.approve) }}>
                  {b.cutoffs.approve} approve
                </span>
                <span className="absolute right-0">{max}</span>
              </div>

              <h4 className="mt-8 text-[12px] font-semibold tracking-wide text-mute uppercase">Scorecard</h4>
              <table className="mt-2 w-full text-sm">
                <tbody className="divide-y divide-line">
                  <tr>
                    <td className="py-2.5 text-mute">Base</td>
                    <td />
                    <td className="num py-2.5 text-right font-medium">300</td>
                  </tr>
                  {b.factors.map((f) => (
                    <tr key={f.name}>
                      <td className="py-2.5">{f.name}</td>
                      <td className="py-2.5 text-mute">{f.value}</td>
                      <td className={cx("num py-2.5 text-right font-medium", f.points < 0 ? "text-bad" : "text-brand")}>
                        {f.points > 0 ? "+" : ""}
                        {f.points}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-ink/80">
                    <td className="py-2.5 font-semibold">Score</td>
                    <td />
                    <td className="num py-2.5 text-right font-semibold">{d.score}</td>
                  </tr>
                </tbody>
              </table>

              <h4 className="mt-8 text-[12px] font-semibold tracking-wide text-mute uppercase">Policy rules</h4>
              <ul className="mt-2 space-y-2">
                {b.rules.map((r) => (
                  <li key={r.code} className="flex items-start gap-3 text-sm">
                    <span className={cx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", r.passed ? "bg-brand-soft text-brand" : "bg-bad-soft text-bad")}>
                      {r.passed ? <Check className="size-3" /> : <X className="size-3" />}
                    </span>
                    <span>
                      <span className="font-medium">{RULES[r.code] ?? r.code}</span>
                      <span className="block text-[12px] text-mute">{r.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>

              {d.reasons.length > 0 && (
                <>
                  <h4 className="mt-8 text-[12px] font-semibold tracking-wide text-mute uppercase">Flags</h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {d.reasons.map((r) => (
                      <Badge key={r} tone={d.outcome === "DECLINE" ? "bad" : "info"}>
                        {reason(r).label}
                      </Badge>
                    ))}
                  </div>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHead title="Affordability" meta="Repayments plus existing debt, against a 40% ceiling" />
            <div className="px-5 pb-6">
              <div className="flex items-baseline justify-between">
                <span className="num display text-[40px] leading-none">{pct(b.affordability.dtiBps)}</span>
                <span className="text-sm text-mute">debt to income</span>
              </div>
              <div className="relative mt-3">
                <Meter value={b.affordability.dtiBps} max={6000} color={b.affordability.dtiBps > 4000 ? "#b4321f" : "#0f6b4f"} className="h-3" />
                <span className="absolute -top-1 h-5 w-px bg-ink" style={{ left: `${(4000 / 6000) * 100}%` }} />
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                {[
                  ["Income", b.affordability.income],
                  ["Existing debt", b.affordability.obligations],
                  ["This loan", b.affordability.installment],
                  ["Room left", b.affordability.maxInstallment],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="text-[12px] text-mute">{k as string}</dt>
                    <dd className="num font-medium">{naira(v as number)}/mo</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Request and offer</h3>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-paper p-4">
                <p className="text-[12px] text-mute">Asked for</p>
                <p className="num mt-1 text-[20px] font-semibold">{naira(app.amount)}</p>
                <p className="text-[12px] text-mute">{app.tenorMonths} months</p>
              </div>
              <div className="rounded-xl bg-ink p-4 text-sheet">
                <p className="text-[12px] text-sheet/60">{app.status === "DECLINED" ? "No offer" : "Offer"}</p>
                <p className="num mt-1 text-[20px] font-semibold">{app.offerAmount ? naira(app.offerAmount) : "—"}</p>
                <p className="text-[12px] text-sheet/60">{app.offerTenor ? `${app.offerTenor} months` : ""}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-mute">Purpose: {app.purpose}</p>
          </Card>

          <Card className="p-5">
            <h3 className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Applicant</h3>
            <dl className="mt-3 space-y-2.5 text-sm">
              {[
                ["Phone", app.phone],
                ["Born", date(app.dateOfBirth)],
                ["Work", `${EMPLOYMENT[app.employment]}${app.employer ? `, ${app.employer}` : ""}`],
                ["Income", `${naira(app.monthlyIncome)} a month`],
                ["Pays into", `${BANKS[app.bankCode ?? ""] ?? app.bankCode} ${app.accountNumber}`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-mute">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {app.bureau && (
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Bureau report</h3>
                <span className="text-[12px] text-mute">{app.bureau.bureau}</span>
              </div>
              {app.bureau.hit ? (
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  {[
                    ["Score", app.bureau.score],
                    ["Open facilities", app.bureau.activeFacilities],
                    ["Delinquent", app.bureau.delinquentFacilities],
                    ["Monthly debt", naira(app.bureau.monthlyObligations)],
                  ].map(([k, v]) => (
                    <div key={k as string} className="rounded-xl bg-paper p-3">
                      <dt className="text-[12px] text-mute">{k as string}</dt>
                      <dd className={cx("num mt-0.5 font-semibold", k === "Delinquent" && Number(v) > 0 && "text-bad")}>{v as string}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-3 text-sm text-mute">No record found for this BVN.</p>
              )}
            </Card>
          )}

          <Card className="p-5">
            <h3 className="mb-4 text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Audit trail</h3>
            <AuditTimeline rows={app.audit ?? []} />
          </Card>
        </div>
      </div>

      {dialog === "approve" && (
        <ApproveDialog
          app={app}
          onClose={() => setDialog(undefined)}
          onDone={() => {
            setDialog(undefined);
            reload();
            refresh();
          }}
        />
      )}
      {dialog === "decline" && (
        <DeclineDialog
          app={app}
          onClose={() => setDialog(undefined)}
          onDone={() => {
            setDialog(undefined);
            reload();
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ApproveDialog({ app, onClose, onDone }: { app: Application; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(String((app.offerAmount ?? app.amount) / 100));
  const [tenor, setTenor] = useState(String(app.offerTenor ?? app.tenorMonths));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const kobo = Math.round(Number(amount || 0) * 100);

  const submit = async () => {
    setBusy(true);
    try {
      await post(`/console/applications/${app.id}/approve`, { amount: kobo, tenor: Number(tenor), note });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed");
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="Approve application">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount (₦)" hint={`Up to ${naira(app.amount)} requested`}>
            <Input value={amount} onChange={(e) => (setAmount(e.target.value), setError(undefined))} inputMode="numeric" />
          </Field>
          <Field label="Months">
            <Input value={tenor} onChange={(e) => (setTenor(e.target.value), setError(undefined))} inputMode="numeric" />
          </Field>
        </div>
        {app.decision?.breakdown && (
          <p className="text-[13px] text-mute">
            Repayment capacity {naira(app.decision.breakdown.affordability.maxInstallment)} a month after existing debt.
          </p>
        )}
        <Field label="Note for the file">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you check?" />
        </Field>
        {kobo > THRESHOLD && <Notice tone="warn">Above {naira(THRESHOLD)}, so this goes to a manager for a second approval.</Notice>}
        {error && <Notice>{error}</Notice>}
        <Button tone="brand" size="lg" className="w-full" onClick={submit} busy={busy}>
          {kobo > THRESHOLD ? "Propose approval" : "Approve and send offer"}
        </Button>
      </div>
    </Dialog>
  );
}

function DeclineDialog({ app, onClose, onDone }: { app: Application; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    await post(`/console/applications/${app.id}/decline`, { note }).catch(() => {});
    onDone();
  };
  return (
    <Dialog open onClose={onClose} title="Decline application">
      <Field label="Reason for the file">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Recorded in the audit trail" autoFocus />
      </Field>
      <Button tone="danger" size="lg" className="mt-4 w-full" onClick={submit} busy={busy}>
        Decline
      </Button>
    </Dialog>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ApplicationDetail />
    </Suspense>
  );
}
