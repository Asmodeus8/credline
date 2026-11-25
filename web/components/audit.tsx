"use client";

import { Bot, User, UserCog } from "lucide-react";
import { cx } from "@/components/ui";
import { BUCKETS, dateTime, naira, title } from "@/lib/format";
import type { AuditEntry } from "@/lib/types";

const MONEY = new Set(["amount", "offerAmount", "principal", "fee", "refund", "interestWaived", "lateFees", "interest"]);
const LABELS: Record<string, string> = { dpd: "Days late", offerAmount: "Offer", offerTenor: "Months", tenor: "Months", next: "Next step", cardAuthorization: "Card check" };

function value(k: string, v: unknown) {
  if (MONEY.has(k) && typeof v === "number") return naira(v);
  const s = String(v);
  if (BUCKETS[s]) return BUCKETS[s].label;
  if (/^[A-Z][A-Z_]+$/.test(s)) return title(s).toLowerCase();
  return s;
}

export function describe(detail: Record<string, unknown>): string {
  const d = { ...(detail ?? {}) };
  if (typeof d.from === "string" && typeof d.to === "string" && BUCKETS[d.from as string]) {
    const moved = `${BUCKETS[d.from as string].label} → ${BUCKETS[d.to as string]?.label ?? d.to}`;
    delete d.from;
    delete d.to;
    const rest = describe(d);
    return rest ? `${moved} · ${rest}` : moved;
  }
  return Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
    .map(([k, v]) => `${LABELS[k] ?? title(k.replace(/([A-Z])/g, "_$1"))}: ${value(k, v)}`)
    .join(" · ");
}

export function AuditTimeline({ rows, compact }: { rows: AuditEntry[]; compact?: boolean }) {
  return (
    <ol className="relative">
      {rows.map((e, i) => {
        const Icon = e.actorType === "SYSTEM" ? Bot : e.actorType === "STAFF" ? UserCog : User;
        return (
          <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
            {i < rows.length - 1 && <span className="absolute top-8 bottom-0 left-[15px] w-px bg-line" />}
            <span
              className={cx(
                "relative grid size-8 shrink-0 place-items-center rounded-full",
                e.actorType === "SYSTEM" ? "bg-ink text-lime" : e.actorType === "STAFF" ? "bg-info-soft text-info" : "bg-brand-soft text-brand",
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-sm">
                <span className="font-medium">{title(e.action)}</span> <span className="text-mute">by {e.actorName}</span>
              </p>
              {!compact && describe(e.detail) && <p className="mt-0.5 text-[12px] break-words text-mute">{describe(e.detail)}</p>}
              <p className="mt-0.5 text-[11px] text-mute/80">{dateTime(e.at)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
