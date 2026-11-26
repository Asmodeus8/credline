"use client";

import { Lock, Pencil } from "lucide-react";
import { useState } from "react";
import { describe } from "@/components/audit";
import { PageTitle, useConsole } from "@/components/console";
import { Badge, Button, Card, CardHead, Dialog, Field, Input, Notice, Skeleton } from "@/components/ui";
import { ApiError, api, useApi } from "@/lib/api";
import { dateTime, naira, pct } from "@/lib/format";
import type { AuditEntry } from "@/lib/types";

type Product = {
  code: string;
  name: string;
  minAmount: number;
  maxAmount: number;
  minTenor: number;
  maxTenor: number;
  monthlyRateBps: number;
  feeBps: number;
  lateFeeBps: number;
  updatedAt: string;
  activeLoans: number;
  applications: number;
};

const ACCENT: Record<string, string> = { QUICK: "#c8f169", SALARY: "#0f6b4f", BUSINESS: "#2b5fb4" };

export default function Products() {
  const { session, tick, refresh } = useConsole();
  const { data, reload } = useApi<Product[]>(`/console/products?t=${tick}`);
  const { data: history, reload: reloadHistory } = useApi<AuditEntry[]>(`/console/audit?entity=product&t=${tick}`);
  const [editing, setEditing] = useState<Product>();
  const manager = session.role === "MANAGER";

  return (
    <div>
      <PageTitle
        title="Products"
        meta="Pricing and limits for new loans. Existing loans keep the terms they were booked on."
        action={
          !manager && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-3 py-1.5 text-[12px] text-mute">
              <Lock className="size-3" /> Managers can edit pricing
            </span>
          )
        }
      />
      {!data && <Skeleton className="h-80" />}
      <div className="grid gap-6 lg:grid-cols-3">
        {data?.map((p) => (
          <Card key={p.code} className="overflow-hidden">
            <div className="h-1.5" style={{ background: ACCENT[p.code] ?? "#141815" }} />
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-[11px] text-mute">{p.code}</p>
                  <h3 className="mt-1 text-[20px] font-semibold tracking-tight">{p.name}</h3>
                </div>
                {manager && (
                  <Button tone="secondary" size="sm" onClick={() => setEditing(p)}>
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                )}
              </div>
              <p className="num display mt-5 text-[48px] leading-none">
                {pct(p.monthlyRateBps)}
                <span className="font-sans text-[14px] text-mute"> / month</span>
              </p>
              <dl className="mt-6 divide-y divide-line text-sm">
                {[
                  ["Amount", `${naira(p.minAmount)} – ${naira(p.maxAmount)}`],
                  ["Tenor", `${p.minTenor} – ${p.maxTenor} months`],
                  ["Upfront fee", pct(p.feeBps)],
                  ["Late fee", `${pct(p.lateFeeBps)} of the instalment`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2.5">
                    <dt className="text-mute">{k}</dt>
                    <dd className="num font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-5 flex flex-wrap gap-2">
                <Badge tone="brand">{p.activeLoans} active loans</Badge>
                <Badge>{p.applications} applications</Badge>
              </div>
              <p className="mt-4 text-[12px] text-mute">Last changed {dateTime(p.updatedAt)}</p>
            </div>
          </Card>
        ))}
      </div>
      <Card className="mt-6">
        <CardHead title="Pricing history" meta="Every change, who made it and what moved" />
        {history && history.length === 0 && <p className="px-5 pb-5 text-sm text-mute">No pricing changes yet. Products are as launched.</p>}
        <ul className="divide-y divide-line border-t border-line">
          {history?.map((h) => (
            <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-3.5 text-sm">
              <span>
                <span className="font-medium">{String(h.detail.code ?? "")}</span> <span className="text-mute">by {h.actorName}</span>
                <span className="block text-[12px] text-mute">{describe(Object.fromEntries(Object.entries(h.detail).filter(([k]) => k !== "code")))}</span>
              </span>
              <span className="text-[12px] text-mute">{dateTime(h.at)}</span>
            </li>
          ))}
        </ul>
      </Card>
      {editing && (
        <EditDialog
          product={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            reload();
            reloadHistory();
            refresh();
          }}
        />
      )}
    </div>
  );
}

function EditDialog({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    minAmount: String(product.minAmount / 100),
    maxAmount: String(product.maxAmount / 100),
    minTenor: String(product.minTenor),
    maxTenor: String(product.maxTenor),
    rate: String(product.monthlyRateBps / 100),
    fee: String(product.feeBps / 100),
    lateFee: String(product.lateFeeBps / 100),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api(`/console/products/${product.code}`, {
        method: "PUT",
        body: {
          minAmount: Math.round(Number(f.minAmount) * 100),
          maxAmount: Math.round(Number(f.maxAmount) * 100),
          minTenor: Number(f.minTenor),
          maxTenor: Number(f.maxTenor),
          monthlyRateBps: Math.round(Number(f.rate) * 100),
          feeBps: Math.round(Number(f.fee) * 100),
          lateFeeBps: Math.round(Number(f.lateFee) * 100),
        },
      });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save");
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={`Edit ${product.name}`} width="max-w-lg">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Minimum amount (₦)">
          <Input value={f.minAmount} onChange={set("minAmount")} inputMode="numeric" />
        </Field>
        <Field label="Maximum amount (₦)">
          <Input value={f.maxAmount} onChange={set("maxAmount")} inputMode="numeric" />
        </Field>
        <Field label="Minimum months">
          <Input value={f.minTenor} onChange={set("minTenor")} inputMode="numeric" />
        </Field>
        <Field label="Maximum months">
          <Input value={f.maxTenor} onChange={set("maxTenor")} inputMode="numeric" />
        </Field>
        <Field label="Monthly rate (%)">
          <Input value={f.rate} onChange={set("rate")} inputMode="decimal" />
        </Field>
        <Field label="Upfront fee (%)">
          <Input value={f.fee} onChange={set("fee")} inputMode="decimal" />
        </Field>
        <Field label="Late fee (%)" className="col-span-2">
          <Input value={f.lateFee} onChange={set("lateFee")} inputMode="decimal" />
        </Field>
      </div>
      <p className="mt-4 text-[13px] text-mute">Applies to quotes and loans booked from now on. The change is written to the audit trail.</p>
      {error && (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      )}
      <Button size="lg" className="mt-5 w-full" onClick={save} busy={busy}>
        Save pricing
      </Button>
    </Dialog>
  );
}
