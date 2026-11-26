"use client";

import { Download, Search, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Kpi, PageTitle, Tabs, exportCsv, useConsole } from "@/components/console";
import { Badge, Button, Card, Empty, Input, Skeleton, cx } from "@/components/ui";
import { useApi } from "@/lib/api";
import { APP_STATUS, EMPLOYMENT, date, naira, nairaShort } from "@/lib/format";

type Row = {
  id: number;
  name: string;
  phone: string;
  employment: string;
  employer?: string;
  monthlyIncome: number;
  createdAt: string;
  loans: number;
  paidOff: number;
  outstanding: number;
  worstDpd: number;
  currentDpd: number;
  writtenOff: boolean;
  hasActive?: boolean;
  lastApplication?: string;
};

type Segment = "ALL" | "ACTIVE" | "LATE" | "REPEAT" | "NEVER";

function risk(r: Row): { label: string; tone: "good" | "warn" | "bad" | "neutral" | "info" } {
  if (r.writtenOff) return { label: "Written off", tone: "bad" };
  if (r.currentDpd > 30) return { label: `${r.currentDpd} days late`, tone: "bad" };
  if (r.currentDpd > 0) return { label: `${r.currentDpd} days late`, tone: "warn" };
  if (r.paidOff > 0 && r.worstDpd <= 7) return { label: "Good payer", tone: "good" };
  if (r.hasActive) return { label: "Current", tone: "info" };
  return { label: "No loan yet", tone: "neutral" };
}

export default function Borrowers() {
  const { tick } = useConsole();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<Segment>("ALL");
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data } = useApi<Row[]>(`/console/borrowers?${new URLSearchParams({ ...(query && { q: query }), t: String(tick) })}`);

  const counts = useMemo(() => {
    const d = data ?? [];
    return {
      ALL: d.length,
      ACTIVE: d.filter((r) => r.hasActive).length,
      LATE: d.filter((r) => r.currentDpd > 0 || r.writtenOff).length,
      REPEAT: d.filter((r) => r.paidOff > 0).length,
      NEVER: d.filter((r) => r.loans === 0).length,
    };
  }, [data]);

  const rows = useMemo(
    () =>
      (data ?? []).filter((r) =>
        segment === "ALL" ? true : segment === "ACTIVE" ? r.hasActive : segment === "LATE" ? r.currentDpd > 0 || r.writtenOff : segment === "REPEAT" ? r.paidOff > 0 : r.loans === 0,
      ),
    [data, segment],
  );

  const exposure = (data ?? []).reduce((s, r) => s + r.outstanding, 0);

  return (
    <div>
      <PageTitle
        title="Borrowers"
        meta="Everyone who has applied, with their standing across every loan"
        action={
          <Button
            tone="secondary"
            size="sm"
            disabled={!rows.length}
            onClick={() =>
              exportCsv(
                "credline-borrowers",
                rows.map((r) => ({ ...r, monthlyIncome: r.monthlyIncome / 100, outstanding: r.outstanding / 100 })),
                [["name", "Name"], ["phone", "Phone"], ["employment", "Employment"], ["monthlyIncome", "Monthly income (NGN)"], ["loans", "Loans"], ["paidOff", "Paid off"], ["outstanding", "Outstanding (NGN)"], ["currentDpd", "Days late"], ["worstDpd", "Worst days late"]],
              )
            }
          >
            <Download className="size-3.5" /> Export CSV
          </Button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Borrowers" value={counts.ALL} hint={`${counts.NEVER} never took a loan`} />
        <Kpi label="With an active loan" value={counts.ACTIVE} hint={`${nairaShort(exposure)} exposure`} accent="#2b5fb4" />
        <Kpi label="Behind on payments" value={counts.LATE} hint="currently late or written off" accent="#b4321f" />
        <Kpi label="Repeat customers" value={counts.REPEAT} hint="repaid at least one loan" accent="#0f6b4f" />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-4 px-5 pt-4">
          <Tabs
            value={segment}
            onChange={setSegment}
            options={[
              { value: "ALL", label: "All", count: counts.ALL },
              { value: "ACTIVE", label: "Active", count: counts.ACTIVE },
              { value: "LATE", label: "Behind", count: counts.LATE },
              { value: "REPEAT", label: "Repeat", count: counts.REPEAT },
              { value: "NEVER", label: "No loan", count: counts.NEVER },
            ]}
          />
          <div className="relative mb-3 w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone" className="h-9 pl-10 text-sm" />
          </div>
        </div>
        {!data && <Skeleton className="m-5 h-72" />}
        {data && rows.length === 0 && <Empty icon={<Users className="size-5" />} title="No borrowers here" />}
        {rows.length > 0 && (
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="sticky top-0 z-10 bg-sheet">
                <tr className="border-b border-line text-left text-[12px] text-mute">
                  <th className="px-5 py-3 font-medium">Borrower</th>
                  <th className="py-3 font-medium">Work</th>
                  <th className="py-3 text-right font-medium">Loans</th>
                  <th className="py-3 text-right font-medium">Outstanding</th>
                  <th className="py-3 pl-8 font-medium">Standing</th>
                  <th className="py-3 font-medium">Last application</th>
                  <th className="px-5 py-3 text-right font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const s = risk(r);
                  const app = r.lastApplication ? APP_STATUS[r.lastApplication] : undefined;
                  return (
                    <tr key={r.id} className="group transition hover:bg-paper/70">
                      <td className="px-5 py-3">
                        <Link href={`/console/borrowers/${r.id}`} className="flex items-center gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-[12px] font-semibold text-lime">
                            {r.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)}
                          </span>
                          <span>
                            <span className="block font-medium group-hover:underline">{r.name}</span>
                            <span className="block text-[12px] text-mute">{r.phone}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="py-3">
                        <span className="block">{EMPLOYMENT[r.employment]}</span>
                        <span className="num block text-[12px] text-mute">{naira(r.monthlyIncome)}/mo</span>
                      </td>
                      <td className="num py-3 text-right">
                        {r.loans}
                        {r.paidOff > 0 && <span className="block text-[11px] text-mute">{r.paidOff} repaid</span>}
                      </td>
                      <td className={cx("num py-3 text-right font-medium", !r.outstanding && "text-mute")}>{r.outstanding ? naira(r.outstanding) : "—"}</td>
                      <td className="py-3 pl-8">
                        <Badge tone={s.tone} dot>
                          {s.label}
                        </Badge>
                      </td>
                      <td className="py-3">{app ? <Badge tone={app.tone}>{app.label}</Badge> : <span className="text-mute">{"—"}</span>}</td>
                      <td className="px-5 py-3 text-right text-mute">{date(r.createdAt)}</td>
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
