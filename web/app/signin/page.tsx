"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { SiteHeader } from "@/components/site";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { ApiError, post } from "@/lib/api";

export default function SignIn() {
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const router = useRouter();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await post("/auth/borrower", { phone, pin });
      router.push("/me");
    } catch (err) {
      setError(err instanceof ApiError && err.status !== 400 ? err.message : "Enter your 11-digit phone number and 4-digit PIN");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <SiteHeader right={<Button href="/apply" tone="secondary" size="sm">New here? Apply</Button>} />
      <main className="mx-auto max-w-md px-5 pt-12 pb-20">
        <h1 className="display text-[44px] leading-tight">Welcome back</h1>
        <p className="mt-2 text-mute">Sign in to see your offer, your schedule and to make a payment.</p>
        <Card className="mt-8 p-6 sm:p-8">
          <form onSubmit={submit} className="space-y-5">
            <Field label="Phone number">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" maxLength={11} placeholder="08031234567" autoFocus autoComplete="tel" />
            </Field>
            <Field label="PIN">
              <Input type="password" value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" maxLength={4} autoComplete="current-password" />
            </Field>
            {error && <Notice>{error}</Notice>}
            <Button type="submit" size="lg" className="w-full" busy={busy}>
              Sign in {!busy && <ArrowRight className="size-4" />}
            </Button>
          </form>
        </Card>
        <p className="mt-6 text-center text-sm text-mute">
          Staff? <Link href="/console/signin" className="font-medium text-ink underline-offset-4 hover:underline">Open the console</Link>
        </p>
      </main>
    </div>
  );
}
