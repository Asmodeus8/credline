export type Product = {
  code: string;
  name: string;
  minAmount: number;
  maxAmount: number;
  minTenor: number;
  maxTenor: number;
  monthlyRateBps: number;
  feeBps: number;
  lateFeeBps: number;
};

export type Line = { seq: number; dueDate: string; principal: number; interest: number; balanceAfter: number };

export type Quote = {
  principal: number;
  fee: number;
  disbursed: number;
  tenorMonths: number;
  monthlyRateBps: number;
  installment: number;
  totalInterest: number;
  totalRepayable: number;
  aprBps: number;
  firstDueDate: string;
  maturityDate: string;
  schedule: Line[];
};

export type Session = { type: "STAFF" | "BORROWER"; id: number; name: string; role: string };

export type Rule = { code: string; passed: boolean; detail: string };
export type Factor = { name: string; value: string; points: number };

export type Decision = {
  policyVersion: string;
  outcome: "APPROVE" | "COUNTER" | "REFER" | "DECLINE";
  score?: number;
  reasons: string[];
  offerAmount?: number;
  offerTenor?: number;
  createdAt: string;
  breakdown?: {
    requested: { amount: number; tenor: number };
    engineOutcome: string;
    rules: Rule[];
    factors: Factor[];
    affordability: { income: number; obligations: number; maxInstallment: number; installment: number; dtiBps: number };
    cutoffs: { approve: number; refer: number };
  };
};

export type AuditEntry = {
  id: number;
  actorType: string;
  actorName: string;
  action: string;
  entity?: string;
  entityId?: number;
  detail: Record<string, unknown>;
  at: string;
};

export type Application = {
  id: number;
  reference: string;
  status: string;
  amount: number;
  tenorMonths: number;
  purpose: string;
  offerAmount?: number;
  offerTenor?: number;
  offerExpiresAt?: string;
  reviewNote?: string;
  createdAt: string;
  productCode: string;
  productName: string;
  monthlyRateBps: number;
  feeBps: number;
  lateFeeBps: number;
  borrowerId: number;
  borrowerName: string;
  phone: string;
  employment: string;
  employer?: string;
  monthlyIncome: number;
  dateOfBirth: string;
  bankCode?: string;
  accountNumber: string;
  makerName?: string;
  checkerName?: string;
  loanId?: number;
  loanReference?: string;
  loanStatus?: string;
  decision?: Decision;
  offer?: Quote;
  bureau?: { bureau: string; hit: boolean; score?: number; activeFacilities: number; delinquentFacilities: number; monthlyObligations: number };
  audit?: AuditEntry[];
};

export type Instalment = {
  id: number;
  seq: number;
  dueDate: string;
  principalDue: number;
  interestDue: number;
  lateFeeDue: number;
  principalPaid: number;
  interestPaid: number;
  lateFeePaid: number;
  interestWaived: number;
  paidOn?: string;
  outstanding: number;
  status: string;
};

export type Repayment = {
  id: number;
  reference: string;
  channel: string;
  amount: number;
  toLateFees: number;
  toInterest: number;
  toPrincipal: number;
  toRefund: number;
  receivedOn: string;
  recordedBy?: string;
};

export type Loan = {
  id: number;
  reference: string;
  status: string;
  productCode: string;
  productName: string;
  principal: number;
  fee: number;
  disbursedAmount: number;
  monthlyRateBps: number;
  lateFeeBps: number;
  tenorMonths: number;
  installmentAmount: number;
  totalInterest: number;
  aprBps: number;
  disbursedOn?: string;
  maturityDate?: string;
  closedOn?: string;
  dpd: number;
  maxDpd: number;
  bucket: string;
  principalPaid: number;
  interestPaid: number;
  feesPaid: number;
  interestWaived: number;
  writtenOffAmount: number;
  outstandingPrincipal: number;
  applicationReference: string;
  applicationId: number;
  borrowerId: number;
  borrowerName: string;
  borrowerPhone: string;
  cardType?: string;
  cardLast4?: string;
  cardBank?: string;
  disbursementReference?: string;
  disbursementStatus?: string;
  disbursementFailure?: string;
  bankCode?: string;
  accountNumber?: string;
  today: string;
  overdue: number;
  payoff: number;
  nextDue?: { seq: number; dueDate: string; amount: number };
  schedule: Instalment[];
  repayments: Repayment[];
  events?: { id: number; type: string; amount?: number; businessDate: string; detail: Record<string, unknown> }[];
  debits?: { reference: string; businessDate: string; amount: number; status: string; failureReason?: string }[];
  audit?: AuditEntry[];
};

export type Receipt = Repayment & { loanClosed: boolean; duplicate: boolean };
