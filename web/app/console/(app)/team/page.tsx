"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { PageTitle, useConsole } from "@/components/console";
import { Badge, Card, Skeleton, cx } from "@/components/ui";
import { useApi } from "@/lib/api";
import { dateTime, title } from "@/lib/format";

type Member = {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  approvals: number;
  confirmations: number;
  declines: number;
  repayments: number;
  writeOffs: number;
  pricingChanges: number;
  lastActive?: string;
  recent?: { action: string; entity: string; entity_id: number; at: string }[];
};

const LINK: Record<string, string> = { loan: "/console/loans/", application: "/console/applications/", borrower: "/console/borrowers/" };

export default function Team() {
  const { tick, session } = useConsole();
  const { data } = useApi<Member[]>(`/console/team?t=${tick}`);
  return (
    <div>
      <PageTitle title="Team" meta="Who can do what, and what each person has done. Counts come straight from the audit trail." />
      <Card className="mb-6 flex flex-wrap items-center gap-4 p-5">
        <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
          <ShieldCheck className="size-5" />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">Separation of duties</p>
          <p className="text-mute">
            Officers review referrals and record transfers. Approvals above ₦300,000, write-offs and pricing changes need a manager, and no one confirms their own proposal.
          </p>
        </div>
      </Card>
      {!data && <Skeleton className="h-80" />}
      <div className="grid gap-6 lg:grid-cols-3">
        {data?.map((m) => (
          <Card key={m.id} className={cx("p-6", m.id === session.id && "ring-2 ring-lime")}>
            <div className="flex items-center gap-3">
              <span className={cx("grid size-12 place-items-center rounded-2xl text-[15px] font-semibold", m.role === "MANAGER" ? "bg-ink text-lime" : "bg-brand-soft text-brand-2")}>
                {m.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {m.name} {m.id === session.id && <span className="text-[12px] font-normal text-mute">(you)</span>}
                </p>
                <p className="truncate text-[13px] text-mute">{m.email}</p>
              </div>
              <Badge tone={m.role === "MANAGER" ? "brand" : "info"}>{m.role === "MANAGER" ? "Manager" : "Officer"}</Badge>
            </div>
            <dl className="mt-6 grid grid-cols-3 gap-2">
              {[
                ["Approvals", m.approvals],
                ["Confirmed", m.confirmations],
                ["Declined", m.declines],
                ["Transfers", m.repayments],
                ["Write-offs", m.writeOffs],
                ["Pricing", m.pricingChanges],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-xl bg-paper px-3 py-2.5">
                  <dt className="text-[11px] text-mute">{k as string}</dt>
                  <dd className="num text-[18px] font-semibold">{v as number}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-[12px] font-semibold tracking-wide text-mute uppercase">Recent</p>
            <ul className="mt-2 space-y-2 text-sm">
              {(m.recent ?? []).length === 0 && <li className="text-mute">Nothing yet.</li>}
              {(m.recent ?? []).map((r, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3">
                  {LINK[r.entity] ? (
                    <Link href={`${LINK[r.entity]}${r.entity_id}`} className="truncate hover:underline">
                      {title(r.action)}
                    </Link>
                  ) : (
                    <span className="truncate">{title(r.action)}</span>
                  )}
                  <span className="shrink-0 text-[11px] text-mute">{dateTime(r.at)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[12px] text-mute">Last active {dateTime(m.lastActive)}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
