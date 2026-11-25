"use client";

import { Search, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PageTitle, useConsole } from "@/components/console";
import { Badge, Card, Empty, Input, Segmented, Skeleton, cx } from "@/components/ui";
import { useApi } from "@/lib/api";
import { BUCKETS, LOAN_STATUS, date, naira } from "@/lib/format";

type Row = {
  id: number;
  reference: string;
  status: string;
  principal: number;
  outstanding: number;
  tenorMonths: number;
  installmentAmount: number;
  disbursedOn?: string;
  maturityDate?: string;
  closedOn?: string;
  dpd: number;
  bucket: string;
  productName: string;
  borrowerName: string;
  phone: string;
  nextDue?: string;
};

export default function LoansPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Loans />
    </Suspense>
  );
}

function Loans() {
  const params = useSearchParams();
  const router = useRouter();
  const { tick } = useConsole();
  const status = params.get("status") ?? "ACTIVE";
  const bucket = params.get("bucket") ?? "";
  const [q, setQ] = useState(params.get("q") ?? "");
  const [query, setQuery] = useState(q);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const qs = new URLSearchParams({ status, ...(bucket && { bucket }), ...(query && { q: query }), t: String(tick) });
  const { data } = useApi<Row[]>(`/console/loans?${qs}`);

  const go = (next: Record<string, string>) => {
    const p = new URLSearchParams({ status, ...(bucket && { bucket }), ...next });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    router.replace(`/console/loans?${p}`);
  };

  return (
    <div className="rise">
      <PageTitle
        title="Loans"
        meta={data ? `${data.length} shown` : "…"}
        action={
          <Segmented
            value={status}
            onChange={(s) => go({ status: s, bucket: s === "ACTIVE" ? bucket : "" })}
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "PAID_OFF", label: "Paid off" },
              { value: "WRITTEN_OFF", label: "Written off" },
              { value: "ALL", label: "All" },
            ]}
          />
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or reference" className="h-10 pl-10" />
        </div>
        {status === "ACTIVE" && (
          <div className="flex flex-wrap gap-1.5">
            <Chip active={!bucket} onClick={() => go({ bucket: "" })}>
              All buckets
            </Chip>
            {Object.entries(BUCKETS).map(([k, v]) => (
              <Chip key={k} active={bucket === k} onClick={() => go({ bucket: k })} color={v.color}>
                {v.label}
              </Chip>
            ))}
          </div>
        )}
      </div>
      <Card className="overflow-hidden">
        {!data && <Skeleton className="m-5 h-64" />}
        {data && data.length === 0 && <Empty icon={<Wallet className="size-5" />} title="No loans match" />}
        {data && data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-mute">
                  <th className="px-5 py-3 font-medium">Borrower</th>
                  <th className="py-3 font-medium">Loan</th>
                  <th className="py-3 text-right font-medium">Outstanding</th>
                  <th className="py-3 font-medium pl-8">Next due</th>
                  <th className="py-3 font-medium">Days late</th>
                  <th className="px-5 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.map((r) => {
                  const s = LOAN_STATUS[r.status];
                  const b = BUCKETS[r.bucket];
                  return (
                    <tr key={r.id} className="group transition hover:bg-paper/70">
                      <td className="px-5 py-3.5">
                        <Link href={`/console/loans/${r.id}`} className="block">
                          <span className="block font-medium group-hover:underline">{r.borrowerName}</span>
                          <span className="block font-mono text-[12px] text-mute">{r.reference}</span>
                        </Link>
                      </td>
                      <td className="num py-3.5">
                        <span className="block">{naira(r.principal)}</span>
                        <span className="block text-[12px] text-mute">
                          {r.productName} · {r.tenorMonths} mo
                        </span>
                      </td>
                      <td className="num py-3.5 text-right font-medium">{r.status === "ACTIVE" ? naira(r.outstanding) : "—"}</td>
                      <td className="py-3.5 pl-8 text-mute">{r.status === "ACTIVE" ? date(r.nextDue) : date(r.closedOn)}</td>
                      <td className="py-3.5">
                        {r.status === "ACTIVE" ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="size-2 rounded-full" style={{ background: b.color }} />
                            <span className={cx("num", r.dpd > 0 ? "font-semibold" : "text-mute")}>{r.dpd}</span>
                          </span>
                        ) : (
                          <span className="text-mute">{"—"}</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">{s && <Badge tone={r.status === "ACTIVE" && r.dpd > 0 ? b.tone : s.tone}>{r.status === "ACTIVE" && r.dpd > 0 ? b.label : s.label}</Badge>}</td>
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

function Chip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition",
        active ? "border-ink bg-ink text-sheet" : "border-line bg-sheet text-ink-2 hover:border-ink/40",
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}
