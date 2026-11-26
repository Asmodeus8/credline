export type Employment = "SALARIED" | "CIVIL_SERVANT" | "SELF_EMPLOYED";

export type EngineInput = { income: number; debt: number; bureau: number; employment: Employment; amount: number; tenor: number; rateBps: number };

export type EngineResult = {
  score: number;
  outcome: "APPROVE" | "COUNTER" | "REFER" | "DECLINE";
  offer: number;
  installment: number;
  capacity: number;
  dti: number;
  factors: { name: string; value: string; points: number; max: number }[];
  reason: string;
};

export function installment(principal: number, tenor: number, rateBps: number) {
  const r = rateBps / 10_000;
  const g = (1 + r) ** tenor;
  return Math.round((principal * r * g) / (g - 1));
}

function maxPrincipal(payment: number, tenor: number, rateBps: number, step = 500_000) {
  if (payment <= 0) return 0;
  const r = rateBps / 10_000;
  let p = Math.floor((payment * (1 - (1 + r) ** -tenor)) / r / step) * step;
  while (p > 0 && installment(p, tenor, rateBps) > payment) p -= step;
  return Math.max(p, 0);
}

const naira = (k: number) => `₦${Math.round(k / 100).toLocaleString("en-NG")}`;

export function decide(i: EngineInput): EngineResult {
  const capacity = Math.max(0, Math.floor(i.income * 0.4) - i.debt);
  let offer = Math.min(i.amount, 20_000_000);
  let inst = installment(offer, i.tenor, i.rateBps);
  let affordable = true;
  if (inst > capacity) {
    const fit = maxPrincipal(capacity, i.tenor, i.rateBps);
    if (fit >= 2_000_000) offer = Math.min(offer, fit);
    else affordable = false;
    inst = installment(offer, i.tenor, i.rateBps);
  }
  const dti = i.income ? (inst + i.debt) / i.income : 1;
  const b = i.bureau;
  const factors = [
    { name: "Bureau score", value: String(b), points: b >= 720 ? 160 : b >= 650 ? 120 : b >= 580 ? 80 : b >= 500 ? 40 : 0, max: 160 },
    { name: "Employment", value: { SALARIED: "Salaried", CIVIL_SERVANT: "Civil servant", SELF_EMPLOYED: "Self-employed" }[i.employment], points: { CIVIL_SERVANT: 90, SALARIED: 80, SELF_EMPLOYED: 50 }[i.employment], max: 90 },
    { name: "Income", value: `${naira(i.income)}/mo`, points: i.income >= 50_000_000 ? 110 : i.income >= 25_000_000 ? 90 : i.income >= 10_000_000 ? 60 : 30, max: 110 },
    { name: "Debt to income", value: `${(dti * 100).toFixed(0)}%`, points: dti <= 0.2 ? 100 : dti <= 0.3 ? 70 : dti <= 0.4 ? 30 : 0, max: 100 },
    { name: "History with us", value: "First loan", points: 20, max: 90 },
  ];
  const score = 300 + factors.reduce((s, f) => s + f.points, 0);
  if (i.income < 3_000_000) return { score, outcome: "DECLINE", offer: 0, installment: inst, capacity, dti, factors, reason: "Income is below the ₦30,000 minimum." };
  if (b < 500 && b > 0 && score < 520) return { score, outcome: "DECLINE", offer: 0, installment: inst, capacity, dti, factors, reason: "The score is below the 520 cut-off." };
  if (!affordable) return { score, outcome: "DECLINE", offer: 0, installment: inst, capacity, dti, factors, reason: "Repayments would take more than 40% of income after existing debt." };
  if (score < 520) return { score, outcome: "DECLINE", offer: 0, installment: inst, capacity, dti, factors, reason: "The score is below the 520 cut-off." };
  if (score < 600) return { score, outcome: "REFER", offer, installment: inst, capacity, dti, factors, reason: "Between 520 and 599, a credit officer takes a closer look." };
  if (offer < i.amount)
    return {
      score,
      outcome: "COUNTER",
      offer,
      installment: inst,
      capacity,
      dti,
      factors,
      reason: offer === 20_000_000 && i.amount > 20_000_000 ? "First loans are capped at ₦200,000." : "Reduced so repayments fit within 40% of income.",
    };
  return { score, outcome: "APPROVE", offer, installment: inst, capacity, dti, factors, reason: "Every rule passes and the score clears 600." };
}
