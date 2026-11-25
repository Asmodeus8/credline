"use client";

import { CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Dialog, Field, Input, Notice, cx } from "@/components/ui";
import { ApiError, idempotencyKey, post } from "@/lib/api";
import { brand, date, naira } from "@/lib/format";
import type { Loan, Receipt } from "@/lib/types";

export function PayDialog({ loan, open, onClose, onPaid }: { loan: Loan; open: boolean; onClose: () => void; onPaid: () => void }) {
  const options = useMemo(() => {
    const o: { id: string; label: string; amount: number; hint: string }[] = [];
    if (loan.overdue > 0) o.push({ id: "overdue", label: "Everything due", amount: loan.overdue, hint: "Brings your loan up to date" });
    else if (loan.nextDue) o.push({ id: "next", label: "Next instalment", amount: loan.nextDue.amount, hint: `Due ${date(loan.nextDue.dueDate)}` });
    o.push({ id: "payoff", label: "Close the loan", amount: loan.payoff, hint: "Future interest waived" });
    return o;
  }, [loan]);
  const [choice, setChoice] = useState(options[0]?.id ?? "custom");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [receipt, setReceipt] = useState<Receipt>();
  const [key] = useState(idempotencyKey);

  const amount = choice === "custom" ? Math.round(Number(custom || 0) * 100) : (options.find((o) => o.id === choice)?.amount ?? 0);

  const pay = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const r = await post<Receipt>(`/me/loans/${loan.id}/repayments`, { amount, idempotencyKey: key });
      setReceipt(r);
      onPaid();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={receipt ? "Payment received" : "Make a payment"}>
      {receipt ? (
        <div className="text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-brand-soft text-brand">
            <CheckCircle2 className="size-7" />
          </div>
          <p className="num display mt-4 text-[44px] leading-none">{naira(receipt.amount)}</p>
          <p className="mt-2 text-sm text-mute">{receipt.loanClosed ? "Your loan is fully repaid. Thank you." : "Applied to your oldest instalments first."}</p>
          <dl className="mt-6 divide-y divide-line rounded-xl bg-paper px-4 text-left text-sm">
            {[
              ["Late fees", receipt.toLateFees],
              ["Interest", receipt.toInterest],
              ["Principal", receipt.toPrincipal],
            ]
              .filter(([, v]) => Number(v) > 0)
              .map(([k, v]) => (
                <div key={k as string} className="flex justify-between py-2.5">
                  <dt className="text-mute">{k as string}</dt>
                  <dd className="num font-medium">{naira(v as number, { kobo: true })}</dd>
                </div>
              ))}
          </dl>
          <Button className="mt-6 w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <div>
          <div className="space-y-2.5">
            {[...options, { id: "custom", label: "Another amount", amount: 0, hint: "" }].map((o) => (
              <button
                key={o.id}
                onClick={() => setChoice(o.id)}
                className={cx(
                  "flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-left transition",
                  choice === o.id ? "border-ink ring-4 ring-ink/5" : "border-line hover:border-ink/30",
                )}
              >
                <span>
                  <span className="block font-medium">{o.label}</span>
                  {o.hint && <span className="text-[12px] text-mute">{o.hint}</span>}
                </span>
                {o.id !== "custom" && <span className="num font-semibold">{naira(o.amount, { kobo: true })}</span>}
              </button>
            ))}
          </div>
          {choice === "custom" && (
            <Field label="Amount (₦)" className="mt-4">
              <Input value={custom} onChange={(e) => setCustom(e.target.value)} inputMode="decimal" autoFocus placeholder="10000" />
            </Field>
          )}
          <p className="mt-4 text-[13px] text-mute">
            Charged to your {brand(loan.cardType)} card ending {loan.cardLast4}.
          </p>
          {error && (
            <div className="mt-4">
              <Notice>{error}</Notice>
            </div>
          )}
          <Button size="lg" className="mt-5 w-full" onClick={pay} busy={busy} disabled={amount <= 0}>
            Pay {amount > 0 ? naira(amount, { kobo: true }) : ""}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
