"use client";

import { Loader2, X } from "lucide-react";
import Link from "next/link";
import { type ComponentProps, type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Tone } from "@/lib/format";

export function cx(...v: (string | false | null | undefined)[]) {
  return v.filter(Boolean).join(" ");
}

const buttonTone = {
  primary: "bg-ink text-sheet hover:bg-ink-2 shadow-[0_1px_0_rgb(255_255_255/0.08)_inset]",
  brand: "bg-brand text-white hover:bg-brand-2",
  secondary: "bg-sheet text-ink border border-line-2 hover:border-ink/40",
  ghost: "text-ink-2 hover:bg-ink/5",
  danger: "bg-bad text-white hover:brightness-110",
};

type ButtonProps = ComponentProps<"button"> & {
  tone?: keyof typeof buttonTone;
  size?: "sm" | "md" | "lg";
  busy?: boolean;
  href?: string;
};

export function Button({ tone = "primary", size = "md", busy, href, className, children, disabled, ...rest }: ButtonProps) {
  const cls = cx(
    "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all select-none whitespace-nowrap",
    "disabled:opacity-45 disabled:pointer-events-none active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    size === "sm" && "h-8 px-3.5 text-[13px]",
    size === "md" && "h-10 px-5 text-sm",
    size === "lg" && "h-12 px-7 text-[15px]",
    buttonTone[tone],
    className,
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button className={cls} disabled={disabled || busy} {...rest}>
      {busy && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div className={cx("rounded-[18px] border border-line bg-sheet shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHead({ title, meta, action }: { title: ReactNode; meta?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
      <div>
        <h3 className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">{title}</h3>
        {meta && <p className="mt-0.5 text-[13px] text-mute">{meta}</p>}
      </div>
      {action}
    </div>
  );
}

const toneClass: Record<Tone, string> = {
  neutral: "bg-ink/[0.06] text-ink-2",
  good: "bg-brand-soft text-brand-2",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  brand: "bg-ink text-lime",
};

export function Badge({ tone = "neutral", children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap", toneClass[tone])}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-[12px] text-bad">{error}</span> : hint ? <span className="mt-1 block text-[12px] text-mute">{hint}</span> : null}
    </label>
  );
}

const inputCls =
  "w-full h-11 rounded-xl border border-line-2 bg-white px-3.5 text-[15px] text-ink placeholder:text-mute/70 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/12";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cx(inputCls, className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <select className={cx(inputCls, "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236f776f%22 stroke-width=%222.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[right_14px_center] bg-no-repeat pr-9", className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputCls, "h-auto min-h-20 py-2.5", className)} {...rest} />;
}

export function Segmented<T extends string | number>({ value, options, onChange, className }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx("inline-flex rounded-full border border-line bg-paper p-1", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "h-8 rounded-full px-3.5 text-[13px] font-medium transition",
            o.value === value ? "bg-sheet text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]" : "text-mute hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Dialog({ open, onClose, title, children, width = "max-w-md" }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={onClose}>
      <div className={cx("rise w-full rounded-t-[22px] bg-sheet shadow-pop sm:rounded-[22px]", width)} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-mute hover:bg-ink/5 hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 grid size-11 place-items-center rounded-full bg-paper text-mute">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-mute">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "bad", children }: { tone?: Tone; children: ReactNode }) {
  return <div className={cx("rounded-xl px-4 py-3 text-sm", toneClass[tone])}>{children}</div>;
}

export function Meter({ value, max, color = "var(--color-brand)", className }: { value: number; max: number; color?: string; className?: string }) {
  const w = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={cx("h-2 overflow-hidden rounded-full bg-ink/[0.07]", className)}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="9" fill={light ? "#c8f169" : "#141815"} />
        <path d="M9 19.5c2.6-6.8 6.4-9.5 14-9.5" stroke={light ? "#141815" : "#c8f169"} strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="10" cy="22.5" r="2.2" fill={light ? "#141815" : "#c8f169"} />
      </svg>
      <span className={cx("text-[19px] font-semibold tracking-tight", light ? "text-sheet" : "text-ink")}>credline</span>
    </span>
  );
}
