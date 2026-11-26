"use client";

import { ArrowLeft, CreditCard, Phone } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense } from "react";
import { AuditTimeline } from "@/components/audit";
import { ScorePill, useConsole } from "@/components/console";
import { Badge, Card, CardHead, Meter, Notice, Skeleton, cx } from "@/components/ui";
import { useApi } from "@/lib/api";
import { APP_STATUS, BANKS, BUCKETS, EMPLOYMENT, LOAN_STATUS, brand, date, naira, reason } from "@/lib/format";
import type { AuditEntry } from "@/lib/types";

type File = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  bvn: string;
  dateOfBirth: string;
  employment: string;
  employer?: string;
  monthlyIncome: number;
  bankCode: string;
  accountNumber: string;
  createdAt: string;
  applications: { id: number; reference: string; status: string; amount: number; tenorMonths: number; offerAmount?: number; createdAt: string; productName: string; outcome?: string; score?: number; reasons?: string[] }[];
  loans: { id: number; reference: string; status: string; principal: number; outstanding: number; dpd: number; maxDpd: number; bucket: string; tenorMonths: number; disbursedOn?: string; closedOn?: string; productName: string; repaid: number }[];
  cards: { cardType: string; last4: string; bank?: string; expMonth: number; expYear: number; active: boolean }[];
  bureau?: { bureau: string; hit: boolean; score?: number; activeFacilities: number; delinquentFacilities: number; monthlyObligations: number; pulledAt: string };
  activity: AuditEntry[];
};

function BorrowerFile() {
  const { id } = useParams<{ id: string }>();
  const { tick } = useConsole();
  const { data: b, error } = useApi<File>(`/console/borrowers/${id}?t=${tick}`);
  if (error) return <Notice>{error.message}</Notice>;
  if (!b) return <Skeleton className="h-[600px]" />;

  const active = b.loans.find((l) => l.status === "ACTIVE");
  const borrowed = b.loans.filter((l) => l.disbursedOn).reduce((s, l) => s + l.principal, 0);
  const repaid = b.loans.reduce((s, l) => s + l.repaid, 0);
  const worst = Math.max(0, ...b.loans.map((l) => l.maxDpd));
  const paidOff = b.loans.filter((l) => l.status === "PAID_OFF").length;
  const initials = `${b.firstName[0]}${b.lastName[0]}`;

  return (
    <div>
      <Link href="/console/borrowers" className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
        <ArrowLeft className="size-4" /> Borrowers
      </Link>

      <div className="relative mt-3 overflow-hidden rounded-[22px] bg-ink p-6 text-sheet sm:p-8">
        <div className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-brand/50 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-5">
          <span className="grid size-16 place-items-center rounded-2xl bg-lime text-[22px] font-semibold text-ink">{initials}</span>
          <div className="min-w-0 flex-1">
            <h1 className="display text-[40px] leading-tight">
              {b.firstName} {b.lastName}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-sheet/60">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-3.5" /> {b.phone}
              </span>
              <span>BVN {b.bvn}</span>
              <span>{EMPLOYMENT[b.employment]}{b.employer ? `, ${b.employer}` : ""}</span>
              <span>Customer since {date(b.createdAt)}</span>
            </p>
          </div>
        </div>
        <dl className="relative mt-7 grid grid-cols-2 gap-4 border-t border-sheet/10 pt-6 sm:grid-cols-4">
          {[
            ["Borrowed to date", naira(borrowed)],
            ["Repaid to date", naira(repaid)],
            ["Loans repaid", String(paidOff)],
            ["Worst days late", String(worst)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[12px] text-sheet/50">{k}</dt>
              <dd className="num mt-1 text-[22px] font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          {active && (
            <Link href={`/console/loans/${active.id}`} className="block">
              <Card className="p-5 transition hover:-translate-y-0.5 hover:shadow-pop">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] text-mute">Active loan · {active.reference}</p>
                    <p className="num mt-1 text-[26px] font-semibold">{naira(active.outstanding)} <span className="text-[14px] font-normal text-mute">of {naira(active.principal)} left</span></p>
                  </div>
                  <Badge tone={BUCKETS[active.bucket].tone} dot>
                    {active.dpd > 0 ? `${active.dpd} days late` : "Current"}
                  </Badge>
                </div>
                <Meter value={active.principal - active.outstanding} max={active.principal} className="mt-4" color={BUCKETS[active.bucket].color} />
              </Card>
            </Link>
          )}

          <Card>
            <CardHead title="Loans" meta={`${b.loans.length} in total`} />
            {b.loans.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-mute">No loans yet.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line border-t border-line">
                  {b.loans.map((l) => {
                    const s = LOAN_STATUS[l.status];
                    return (
                      <tr key={l.id} className="transition hover:bg-paper/70">
                        <td className="px-5 py-3">
                          <Link href={`/console/loans/${l.id}`} className="font-mono text-[13px] hover:underline">
                            {l.reference}
                          </Link>
                          <span className="block text-[12px] text-mute">
                            {l.productName} · {l.tenorMonths} months
                          </span>
                        </td>
                        <td className="num py-3 text-right">{naira(l.principal)}</td>
                        <td className="py-3 pl-6 text-mute">{l.disbursedOn ? `${date(l.disbursedOn)} → ${l.closedOn ? date(l.closedOn) : "now"}` : "—"}</td>
                        <td className="num py-3 text-right text-mute">worst {l.maxDpd}d</td>
                        <td className="px-5 py-3 text-right">{s && <Badge tone={s.tone}>{s.label}</Badge>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>

          <Card>
            <CardHead title="Applications" />
            <ul className="divide-y divide-line border-t border-line">
              {b.applications.map((a) => {
                const s = APP_STATUS[a.status];
                return (
                  <li key={a.id}>
                    <Link href={`/console/applications/${a.id}`} className="flex flex-wrap items-center gap-4 px-5 py-3.5 transition hover:bg-paper/70">
                      {a.score !== undefined && <ScorePill score={a.score} />}
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">
                          {a.productName} · {naira(a.amount)} over {a.tenorMonths} months
                        </span>
                        <span className="block text-[12px] text-mute">
                          <span className="font-mono">{a.reference}</span> · {date(a.createdAt)}
                          {a.reasons?.length ? ` · ${a.reasons.map((r) => reason(r).label).join(", ")}` : ""}
                        </span>
                      </span>
                      {s && <Badge tone={s.tone}>{s.label}</Badge>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Income and bank</h3>
            <dl className="mt-3 space-y-2.5 text-sm">
              {[
                ["Monthly income", naira(b.monthlyIncome)],
                ["Born", date(b.dateOfBirth)],
                ["Payout account", `${BANKS[b.bankCode] ?? b.bankCode} ${b.accountNumber}`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-mute">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {b.cards.map((c, i) => (
              <div key={i} className={cx("mt-4 flex items-center gap-3 rounded-xl p-3", c.active ? "bg-paper" : "bg-paper/50 opacity-60")}>
                <CreditCard className="size-4 text-mute" />
                <span className="flex-1 text-sm">
                  {brand(c.cardType)} •••• {c.last4}
                  <span className="block text-[12px] text-mute">
                    {c.bank} · {String(c.expMonth).padStart(2, "0")}/{String(c.expYear).slice(-2)}
                  </span>
                </span>
                {c.active && <Badge tone="good">Mandate</Badge>}
              </div>
            ))}
          </Card>

          {b.bureau && (
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Latest bureau pull</h3>
                <span className="text-[12px] text-mute">{date(b.bureau.pulledAt)}</span>
              </div>
              {b.bureau.hit ? (
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  {[
                    ["Score", b.bureau.score],
                    ["Open facilities", b.bureau.activeFacilities],
                    ["Delinquent", b.bureau.delinquentFacilities],
                    ["Monthly debt", naira(b.bureau.monthlyObligations)],
                  ].map(([k, v]) => (
                    <div key={k as string} className="rounded-xl bg-paper p-3">
                      <dt className="text-[12px] text-mute">{k as string}</dt>
                      <dd className={cx("num mt-0.5 font-semibold", k === "Delinquent" && Number(v) > 0 && "text-bad")}>{v as string}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-3 text-sm text-mute">No record at the bureau.</p>
              )}
            </Card>
          )}

          <Card className="p-5">
            <h3 className="mb-4 text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Activity</h3>
            <div className="max-h-[520px] overflow-y-auto pr-1">
              <AuditTimeline rows={b.activity} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BorrowerFile />
    </Suspense>
  );
}
