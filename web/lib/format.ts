const nf = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function naira(kobo: number | null | undefined, opts: { kobo?: boolean } = {}) {
  const v = Number(kobo ?? 0) / 100;
  const sign = v < 0 ? "−" : "";
  const abs = Math.abs(v);
  return `${sign}₦${opts.kobo ? nf2.format(abs) : nf.format(abs)}`;
}

export function nairaShort(kobo: number | null | undefined) {
  const v = Math.abs(Number(kobo ?? 0) / 100);
  if (v >= 1_000_000_000) return `₦${(v / 1_000_000_000).toFixed(2)}bn`;
  if (v >= 1_000_000) return `₦${(v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)}m`;
  if (v >= 1_000) return `₦${(v / 1_000).toFixed(v >= 100_000 ? 0 : 1)}k`;
  return `₦${nf.format(v)}`;
}

export function pct(bps: number | null | undefined, digits = 1) {
  return `${(Number(bps ?? 0) / 100).toFixed(digits)}%`;
}

export function ratio(part: number, whole: number, digits = 1) {
  if (!whole) return "0%";
  return `${((part / whole) * 100).toFixed(digits)}%`;
}

const df = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const dfShort = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const dtf = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function date(v: string | null | undefined, short = false) {
  if (!v) return "—";
  const d = v.length === 10 ? new Date(`${v}T12:00:00`) : new Date(v);
  return (short ? dfShort : df).format(d);
}

export function dateTime(v: string | null | undefined) {
  if (!v) return "—";
  return dtf.format(new Date(v));
}

export function daysBetween(from: string, to: string) {
  return Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000);
}

export function title(v: string | null | undefined) {
  if (!v) return "";
  const s = v.toLowerCase().replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const BANKS: Record<string, string> = {
  "044": "Access Bank",
  "058": "GTBank",
  "011": "First Bank",
  "033": "UBA",
  "057": "Zenith Bank",
  "070": "Fidelity Bank",
  "232": "Sterling Bank",
  "50211": "Kuda",
  "999992": "OPay",
  "100004": "Moniepoint",
};

export const EMPLOYMENT: Record<string, string> = {
  SALARIED: "Salaried, private sector",
  CIVIL_SERVANT: "Civil servant",
  SELF_EMPLOYED: "Self-employed",
  UNEMPLOYED: "Not working",
};

export const REASONS: Record<string, { label: string; borrower: string }> = {
  AGE_OUT_OF_POLICY: { label: "Age outside policy", borrower: "We lend to people aged 21 to 60 by the end of the loan." },
  INCOME_BELOW_MINIMUM: { label: "Income below minimum", borrower: "Your monthly income is below our ₦30,000 minimum." },
  NO_VERIFIABLE_INCOME: { label: "No verifiable income", borrower: "We need a regular income to lend against." },
  BUREAU_DELINQUENCY: { label: "Bureau delinquency", borrower: "Your credit report shows a loan that is behind on repayments." },
  PRIOR_WRITE_OFF: { label: "Previous write-off", borrower: "A previous loan with us was not repaid." },
  UNAFFORDABLE: { label: "Not affordable", borrower: "The repayments would take more than 40% of your income after existing debts." },
  SCORE_BELOW_CUTOFF: { label: "Score below cut-off", borrower: "Your overall credit score is below what we can lend on today." },
  FIRST_LOAN_LIMIT: { label: "First-loan limit", borrower: "First loans are capped at ₦200,000. Repay on time to unlock more." },
  AFFORDABILITY: { label: "Reduced to fit income", borrower: "We lowered the amount so repayments stay within 40% of your income." },
  SCORE_IN_REVIEW_BAND: { label: "Score in review band", borrower: "A credit officer is taking a closer look." },
  THIN_FILE: { label: "No bureau history", borrower: "You have little credit history, so an officer is reviewing it." },
  ABOVE_AUTO_APPROVAL_LIMIT: { label: "Above auto-approval limit", borrower: "Larger loans are checked by an officer." },
};

export const RULES: Record<string, string> = {
  AGE_OUT_OF_POLICY: "Age 21 to 60 by maturity",
  INCOME_BELOW_MINIMUM: "Minimum income",
  NO_VERIFIABLE_INCOME: "Verifiable income",
  BUREAU_DELINQUENCY: "No arrears at the bureau",
  PRIOR_WRITE_OFF: "No previous write-off",
  UNAFFORDABLE: "Affordability",
};

export function brand(v: string | null | undefined) {
  if (!v) return "Card";
  return v.length <= 4 ? v.toUpperCase() : v.charAt(0).toUpperCase() + v.slice(1);
}

export function reason(code: string) {
  return REASONS[code] ?? { label: title(code), borrower: title(code) };
}

export type Tone = "neutral" | "good" | "warn" | "bad" | "info" | "brand";

export const APP_STATUS: Record<string, { label: string; tone: Tone }> = {
  APPROVED: { label: "Offer open", tone: "good" },
  REFERRED: { label: "In review", tone: "info" },
  PENDING_CHECKER: { label: "Awaiting second approval", tone: "warn" },
  DECLINED: { label: "Declined", tone: "bad" },
  ACCEPTED: { label: "Accepted", tone: "brand" },
  REJECTED_BY_BORROWER: { label: "Offer turned down", tone: "neutral" },
  EXPIRED: { label: "Offer expired", tone: "neutral" },
};

export const LOAN_STATUS: Record<string, { label: string; tone: Tone }> = {
  DISBURSING: { label: "Disbursing", tone: "info" },
  ACTIVE: { label: "Active", tone: "brand" },
  PAID_OFF: { label: "Paid off", tone: "good" },
  WRITTEN_OFF: { label: "Written off", tone: "bad" },
  DISBURSEMENT_FAILED: { label: "Disbursement failed", tone: "bad" },
};

export const BUCKETS: Record<string, { label: string; tone: Tone; color: string }> = {
  CURRENT: { label: "Current", tone: "good", color: "#0f6b4f" },
  DPD_1_30: { label: "1–30 days", tone: "warn", color: "#d9a23c" },
  DPD_31_60: { label: "31–60 days", tone: "warn", color: "#c8742a" },
  DPD_61_90: { label: "61–90 days", tone: "bad", color: "#b8502a" },
  DPD_90_PLUS: { label: "90+ days", tone: "bad", color: "#8f2417" },
};

export const INSTALMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  PAID: { label: "Paid", tone: "good" },
  OVERDUE: { label: "Overdue", tone: "bad" },
  DUE: { label: "Due today", tone: "warn" },
  PARTIAL: { label: "Part paid", tone: "info" },
  UPCOMING: { label: "Upcoming", tone: "neutral" },
};
