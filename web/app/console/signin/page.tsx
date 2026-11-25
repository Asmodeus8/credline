"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button, Field, Input, Logo, Notice } from "@/components/ui";
import { ApiError, post } from "@/lib/api";

const DEMO = [
  ["ada@credline.ng", "Ada Okafor", "Credit officer"],
  ["kunle@credline.ng", "Kunle Adeyemi", "Credit officer"],
  ["tunde@credline.ng", "Tunde Bakare", "Credit manager"],
];

export default function StaffSignIn() {
  const [email, setEmail] = useState("ada@credline.ng");
  const [password, setPassword] = useState("credline-demo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const router = useRouter();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await post("/auth/staff", { email, password });
      router.push("/console");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed");
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="relative hidden overflow-hidden bg-ink p-12 text-sheet lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -bottom-40 -left-20 size-[520px] rounded-full bg-brand/50 blur-[120px]" />
        <Logo light />
        <div className="relative">
          <p className="display text-[52px] leading-[1.02]">
            Decide, disburse
            <br />
            and collect, <em className="text-lime">on the record.</em>
          </p>
          <p className="mt-5 max-w-sm text-sheet/60">Every approval, payment and bucket move is written to an append-only audit trail.</p>
        </div>
        <p className="relative text-[12px] text-sheet/40">Credline lending console</p>
      </div>
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <Logo />
          </div>
          <h1 className="mt-8 text-[28px] font-semibold tracking-tight lg:mt-0">Staff sign in</h1>
          <form onSubmit={submit} className="mt-8 space-y-5">
            <Field label="Work email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
            {error && <Notice>{error}</Notice>}
            <Button type="submit" size="lg" className="w-full" busy={busy}>
              Sign in {!busy && <ArrowRight className="size-4" />}
            </Button>
          </form>
          <div className="mt-10 rounded-2xl border border-dashed border-line-2 p-4">
            <p className="text-[12px] font-semibold tracking-wide text-mute uppercase">Demo accounts · password credline-demo</p>
            <div className="mt-3 space-y-1">
              {DEMO.map(([e, n, r]) => (
                <button key={e} onClick={() => setEmail(e)} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-ink/5">
                  <span className="font-medium">{n}</span>
                  <span className="text-[12px] text-mute">{r}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
