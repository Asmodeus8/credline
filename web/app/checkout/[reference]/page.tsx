"use client";

import { Check, FlaskConical, Lock } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Logo, Notice, Skeleton, cx } from "@/components/ui";
import { ApiError, post, useApi } from "@/lib/api";
import { naira } from "@/lib/format";

type Card = { id: string; number: string; brand: string; label: string; behaviour: string; last4: string; bank: string };
type Checkout = {
  reference: string;
  completedAt?: string;
  applicationReference: string;
  offerAmount: number;
  offerTenor: number;
  firstName: string;
  productName: string;
  amount: number;
  cards: Card[];
};

function CheckoutPage() {
  const { reference } = useParams<{ reference: string }>();
  const { data, error } = useApi<Checkout>(`/sandbox/checkout/${reference}`);
  const [card, setCard] = useState("reliable");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string>();
  const router = useRouter();

  const pay = async () => {
    setBusy(true);
    setFailed(undefined);
    try {
      const res = await post<{ loanId?: number }>(`/sandbox/checkout/${reference}`, { card });
      router.push(res.loanId ? `/me/loans/${res.loanId}?new=1` : "/me");
    } catch (e) {
      setFailed(e instanceof ApiError ? e.message : "Payment failed");
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[#e9e6dd] px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-4 flex items-center justify-between px-1">
          <Logo />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 text-[11px] font-semibold tracking-wide text-warn uppercase">
            <FlaskConical className="size-3" /> Sandbox checkout
          </span>
        </div>
        <div className="overflow-hidden rounded-[22px] bg-sheet shadow-pop">
          {error && (
            <div className="p-6">
              <Notice>{error.message}</Notice>
            </div>
          )}
          {!data && !error && <Skeleton className="m-6 h-80" />}
          {data && (
            <>
              <div className="border-b border-line px-6 py-5">
                <p className="text-sm text-mute">Card authorisation for {data.applicationReference}</p>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="num display text-[40px] leading-none">{naira(data.amount, { kobo: true })}</span>
                  <span className="text-[12px] text-mute">refunded after linking</span>
                </div>
              </div>
              {data.completedAt ? (
                <div className="p-6">
                  <Notice tone="good">This card has already been linked.</Notice>
                  <Button href="/me" className="mt-4 w-full">
                    Go to your account
                  </Button>
                </div>
              ) : (
                <div className="p-6">
                  <p className="text-[13px] font-medium text-ink-2">Choose a test card</p>
                  <div className="mt-3 space-y-2.5">
                    {data.cards.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCard(c.id)}
                        className={cx(
                          "flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition",
                          card === c.id ? "border-ink bg-white ring-4 ring-ink/5" : "border-line hover:border-ink/30",
                        )}
                      >
                        <CardArt brand={c.brand} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-[13px] tracking-wider">{c.number}</span>
                          <span className="mt-0.5 block text-[12px] text-mute">
                            {c.bank} · {c.label}
                          </span>
                        </span>
                        <span className={cx("grid size-5 place-items-center rounded-full border", card === c.id ? "border-ink bg-ink text-sheet" : "border-line-2")}>
                          {card === c.id && <Check className="size-3" />}
                        </span>
                      </button>
                    ))}
                  </div>
                  {failed && (
                    <div className="mt-4">
                      <Notice>{failed}</Notice>
                    </div>
                  )}
                  <Button size="lg" className="mt-6 w-full" onClick={pay} busy={busy}>
                    <Lock className="size-4" /> Authorise {naira(data.amount, { kobo: true })}
                  </Button>
                  <p className="mt-4 text-center text-[12px] leading-relaxed text-mute">
                    In production this step is a Paystack checkout. The card you pick decides how the simulated auto-debits behave later.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CardArt({ brand }: { brand: string }) {
  const bg = brand === "visa" ? "from-[#1a2b6d] to-[#3c56c4]" : "from-[#0d4f3c] to-[#1f8a63]";
  return (
    <span className={cx("relative grid h-9 w-13 shrink-0 place-items-end overflow-hidden rounded-md bg-gradient-to-br p-1", bg)}>
      <span className="absolute top-1.5 left-1.5 h-2 w-3 rounded-[2px] bg-[#e6c66a]" />
      <span className="text-[8px] font-bold tracking-wide text-white uppercase">{brand}</span>
    </span>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CheckoutPage />
    </Suspense>
  );
}
