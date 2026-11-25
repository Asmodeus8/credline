"use client";

import { ArrowLeft, ArrowRight, Check, FlaskConical } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { LoanPicker, type Pick, QuoteSummary, clampPick, useProducts, useQuote } from "@/components/calculator";
import { SiteHeader } from "@/components/site";
import { Button, Card, Field, Input, Notice, Select, Skeleton, cx } from "@/components/ui";
import { ApiError, post } from "@/lib/api";
import { BANKS, EMPLOYMENT } from "@/lib/format";
import type { Application, Product } from "@/lib/types";

type Form = {
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string;
  bvn: string;
  pin: string;
  employment: string;
  employer: string;
  income: string;
  bankCode: string;
  accountNumber: string;
  purpose: string;
};

const EMPTY: Form = {
  firstName: "",
  lastName: "",
  phone: "",
  dateOfBirth: "",
  bvn: "",
  pin: "",
  employment: "SALARIED",
  employer: "",
  income: "",
  bankCode: "058",
  accountNumber: "",
  purpose: "Rent",
};

const STEPS = ["Your loan", "About you", "Income and bank"];
const PURPOSES = ["Rent", "School fees", "Medical", "Stock for business", "Equipment", "Travel", "Emergency", "Other"];

function errorsFor(step: number, f: Form) {
  const e: Partial<Record<keyof Form, string>> = {};
  if (step === 1) {
    if (!f.firstName.trim()) e.firstName = "Required";
    if (!f.lastName.trim()) e.lastName = "Required";
    if (!/^0[789][01]\d{8}$/.test(f.phone)) e.phone = "11 digits, like 08031234567";
    if (!f.dateOfBirth) e.dateOfBirth = "Required";
    if (!/^\d{11}$/.test(f.bvn)) e.bvn = "11 digits";
    if (!/^\d{4}$/.test(f.pin)) e.pin = "4 digits";
  }
  if (step === 2) {
    if (!f.income || Number(f.income) < 0) e.income = "Required";
    if (!/^\d{10}$/.test(f.accountNumber)) e.accountNumber = "10-digit NUBAN";
    if (f.employment !== "UNEMPLOYED" && !f.employer.trim()) e.employer = "Required";
  }
  return e;
}

function initialPick(products: Product[]) {
  const saved = typeof window === "undefined" ? null : sessionStorage.getItem("credline:pick");
  const wanted = saved ? (JSON.parse(saved) as Pick) : undefined;
  const product = products.find((p) => p.code === wanted?.product) ?? products.find((p) => p.code === "SALARY") ?? products[0];
  return clampPick(product, wanted ?? { amount: 15_000_000, tenor: 6 });
}

export default function Apply() {
  const products = useProducts();
  const [chosen, setPick] = useState<Pick>();
  const pick = chosen ?? (products?.length ? initialPick(products) : undefined);
  const quote = useQuote(pick);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const router = useRouter();

  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const errors = touched ? errorsFor(step, form) : {};

  const next = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errorsFor(step, form)).length) return;
    setTouched(false);
    if (step < 2) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const app = await post<Application>("/applications", {
        borrower: {
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          bvn: form.bvn,
          dateOfBirth: form.dateOfBirth,
          employment: form.employment,
          employer: form.employer || null,
          monthlyIncome: Math.round(Number(form.income) * 100),
          bankCode: form.bankCode,
          accountNumber: form.accountNumber,
          pin: form.pin,
        },
        loan: { ...pick, purpose: form.purpose },
      });
      sessionStorage.removeItem("credline:pick");
      router.push(`/me/applications/${app.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto grid max-w-6xl gap-8 px-5 pt-4 pb-20 sm:px-8 lg:grid-cols-[1fr_380px]">
        <div>
          <ol className="mb-8 flex items-center gap-2">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <span
                  className={cx(
                    "grid size-7 place-items-center rounded-full text-[12px] font-semibold transition",
                    i < step ? "bg-brand text-white" : i === step ? "bg-ink text-sheet" : "bg-ink/[0.07] text-mute",
                  )}
                >
                  {i < step ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className={cx("hidden text-sm sm:inline", i === step ? "font-medium" : "text-mute")}>{s}</span>
                {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-line-2 sm:w-10" />}
              </li>
            ))}
          </ol>

          <form onSubmit={next} className="rise" key={step}>
            <h1 className="display text-[40px] leading-tight">{["What do you need?", "Tell us about you", "Your income and bank"][step]}</h1>
            <p className="mt-2 text-mute">
              {
                [
                  "Pick a product, an amount and how long you want to repay.",
                  "This creates your Credline account. You'll sign in with your phone number and PIN.",
                  "We pay the loan into this account. Income is checked against your bureau report.",
                ][step]
              }
            </p>

            <Card className="mt-8 p-6 sm:p-8">
              {step === 0 &&
                (products && pick ? (
                  <div className="space-y-6">
                    <LoanPicker products={products} pick={pick} onChange={setPick} />
                    <Field label="What's it for?">
                      <div className="flex flex-wrap gap-2">
                        {PURPOSES.map((p) => (
                          <button
                            type="button"
                            key={p}
                            onClick={() => setForm((f) => ({ ...f, purpose: p }))}
                            className={cx(
                              "h-9 rounded-full border px-4 text-sm transition",
                              form.purpose === p ? "border-ink bg-ink text-sheet" : "border-line bg-white text-ink-2 hover:border-ink/40",
                            )}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </Field>
                  </div>
                ) : (
                  <Skeleton className="h-60" />
                ))}

              {step === 1 && (
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="First name" error={errors.firstName}>
                    <Input value={form.firstName} onChange={set("firstName")} autoComplete="given-name" autoFocus />
                  </Field>
                  <Field label="Last name" error={errors.lastName}>
                    <Input value={form.lastName} onChange={set("lastName")} autoComplete="family-name" />
                  </Field>
                  <Field label="Phone number" error={errors.phone}>
                    <Input value={form.phone} onChange={set("phone")} inputMode="numeric" maxLength={11} placeholder="08031234567" autoComplete="tel" />
                  </Field>
                  <Field label="Date of birth" error={errors.dateOfBirth}>
                    <Input type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} max="2007-12-31" />
                  </Field>
                  <Field
                    label="BVN"
                    error={errors.bvn}
                    hint={
                      <span className="inline-flex items-center gap-1.5">
                        <FlaskConical className="size-3" /> Sandbox: the last digit picks the bureau file. 5 to 9 clean, 2 to 4 borderline, 1 none, 0 in arrears.
                      </span>
                    }
                  >
                    <Input value={form.bvn} onChange={set("bvn")} inputMode="numeric" maxLength={11} placeholder="22212345678" />
                  </Field>
                  <Field label="Choose a 4-digit PIN" error={errors.pin}>
                    <Input type="password" value={form.pin} onChange={set("pin")} inputMode="numeric" maxLength={4} autoComplete="new-password" />
                  </Field>
                </div>
              )}

              {step === 2 && (
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Employment">
                    <Select value={form.employment} onChange={set("employment")}>
                      {Object.entries(EMPLOYMENT).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={form.employment === "SELF_EMPLOYED" ? "Business name" : "Employer"} error={errors.employer}>
                    <Input value={form.employer} onChange={set("employer")} disabled={form.employment === "UNEMPLOYED"} />
                  </Field>
                  <Field label="Monthly income after tax (₦)" error={errors.income}>
                    <Input value={form.income} onChange={set("income")} inputMode="numeric" placeholder="350000" />
                  </Field>
                  <div />
                  <Field label="Bank">
                    <Select value={form.bankCode} onChange={set("bankCode")}>
                      {Object.entries(BANKS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Account number" error={errors.accountNumber}>
                    <Input value={form.accountNumber} onChange={set("accountNumber")} inputMode="numeric" maxLength={10} placeholder="0123456789" />
                  </Field>
                </div>
              )}

              {error && (
                <div className="mt-6">
                  <Notice>{error}</Notice>
                </div>
              )}

              <div className="mt-8 flex items-center justify-between border-t border-line pt-6">
                {step > 0 ? (
                  <Button type="button" tone="ghost" onClick={() => setStep(step - 1)}>
                    <ArrowLeft className="size-4" /> Back
                  </Button>
                ) : (
                  <span />
                )}
                <Button type="submit" size="lg" busy={busy}>
                  {step < 2 ? "Continue" : "Get my decision"} {!busy && <ArrowRight className="size-4" />}
                </Button>
              </div>
            </Card>
          </form>
        </div>

        <aside className="lg:pt-[92px]">
          <div className="sticky top-6 rounded-[22px] bg-ink p-6 text-sheet shadow-pop">
            <p className="text-[12px] font-medium tracking-wide text-lime uppercase">Your estimate</p>
            <div className="mt-4">
              <QuoteSummary quote={quote} dark />
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-sheet/50">The final offer depends on your credit decision and may be lower than you ask for.</p>
          </div>
        </aside>
      </main>
    </div>
  );
}
