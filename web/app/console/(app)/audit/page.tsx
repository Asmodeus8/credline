"use client";

import { Bot, User, UserCog } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { describe } from "@/components/audit";
import { PageTitle, useConsole } from "@/components/console";
import { Button, Card, Segmented, Skeleton, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime, title } from "@/lib/format";
import type { AuditEntry } from "@/lib/types";

export default function AuditPage() {
  const { tick } = useConsole();
  const [entity, setEntity] = useState("");
  const [rows, setRows] = useState<AuditEntry[]>();
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<AuditEntry[]>(`/console/audit${entity ? `?entity=${entity}` : ""}`).then((r) => {
      setRows(r);
      setMore(r.length === 100);
    });
  }, [entity, tick]);

  const loadMore = async () => {
    if (!rows?.length) return;
    setBusy(true);
    const next = await api<AuditEntry[]>(`/console/audit?before=${rows[rows.length - 1].id}${entity ? `&entity=${entity}` : ""}`);
    setRows([...rows, ...next]);
    setMore(next.length === 100);
    setBusy(false);
  };

  const link = (e: AuditEntry) =>
    e.entity === "loan" ? `/console/loans/${e.entityId}` : e.entity === "application" ? `/console/applications/${e.entityId}` : undefined;

  return (
    <div className="rise">
      <PageTitle
        title="Audit trail"
        meta="Append-only. The database rejects updates and deletes on this table."
        action={
          <Segmented
            value={entity}
            onChange={setEntity}
            options={[
              { value: "", label: "Everything" },
              { value: "application", label: "Applications" },
              { value: "loan", label: "Loans" },
              { value: "borrower", label: "Borrowers" },
            ]}
          />
        }
      />
      <Card className="overflow-hidden">
        {!rows && <Skeleton className="m-5 h-80" />}
        {rows && (
          <ul className="divide-y divide-line">
            {rows.map((e) => {
              const Icon = e.actorType === "SYSTEM" ? Bot : e.actorType === "STAFF" ? UserCog : User;
              const href = link(e);
              return (
                <li key={e.id} className="flex items-start gap-4 px-5 py-3.5">
                  <span
                    className={cx(
                      "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
                      e.actorType === "SYSTEM" ? "bg-ink text-lime" : e.actorType === "STAFF" ? "bg-info-soft text-info" : "bg-brand-soft text-brand",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{title(e.action)}</span>
                      <span className="text-mute"> by {e.actorName} · </span>
                      {href ? (
                        <Link href={href} className="font-mono text-[12px] text-ink-2 hover:underline">
                          {e.entity} #{e.entityId}
                        </Link>
                      ) : (
                        <span className="font-mono text-[12px] text-mute">
                          {e.entity} #{e.entityId}
                        </span>
                      )}
                    </p>
                    {describe(e.detail) && <p className="mt-0.5 text-[12px] break-words text-mute">{describe(e.detail)}</p>}
                  </div>
                  <span className="num shrink-0 text-[12px] text-mute">{dateTime(e.at)}</span>
                </li>
              );
            })}
          </ul>
        )}
        {more && (
          <div className="border-t border-line p-4 text-center">
            <Button tone="secondary" size="sm" onClick={loadMore} busy={busy}>
              Older entries
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
