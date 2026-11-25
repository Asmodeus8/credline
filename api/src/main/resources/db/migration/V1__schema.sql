create function forbid_change() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '55000';
end $$;

create table staff (
  id bigserial primary key,
  email text not null unique,
  name text not null,
  role text not null check (role in ('OFFICER', 'MANAGER')),
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table borrowers (
  id bigserial primary key,
  phone text not null unique,
  pin_hash text not null,
  first_name text not null,
  last_name text not null,
  bvn text not null unique check (bvn ~ '^[0-9]{11}$'),
  date_of_birth date not null,
  employment text not null check (employment in ('SALARIED', 'CIVIL_SERVANT', 'SELF_EMPLOYED', 'UNEMPLOYED')),
  employer text,
  monthly_income bigint not null check (monthly_income >= 0),
  bank_code text not null,
  account_number text not null check (account_number ~ '^[0-9]{10}$'),
  created_at timestamptz not null default now()
);

create table products (
  code text primary key,
  name text not null,
  min_amount bigint not null check (min_amount > 0),
  max_amount bigint not null check (max_amount >= min_amount),
  min_tenor int not null check (min_tenor > 0),
  max_tenor int not null check (max_tenor >= min_tenor),
  monthly_rate_bps int not null check (monthly_rate_bps > 0),
  fee_bps int not null check (fee_bps >= 0),
  late_fee_bps int not null check (late_fee_bps >= 0)
);

create table applications (
  id bigserial primary key,
  reference text not null unique,
  borrower_id bigint not null references borrowers,
  product_code text not null references products,
  amount bigint not null check (amount > 0),
  tenor_months int not null check (tenor_months > 0),
  purpose text not null,
  status text not null check (status in ('APPROVED', 'REFERRED', 'PENDING_CHECKER', 'DECLINED', 'ACCEPTED', 'REJECTED_BY_BORROWER', 'EXPIRED')),
  offer_amount bigint check (offer_amount > 0),
  offer_tenor int check (offer_tenor > 0),
  offer_expires_at timestamptz,
  maker_id bigint references staff,
  checker_id bigint references staff,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (checker_id is null or checker_id <> maker_id),
  check (status not in ('APPROVED', 'PENDING_CHECKER', 'ACCEPTED') or (offer_amount is not null and offer_tenor is not null))
);

create unique index one_open_application on applications (borrower_id)
  where status in ('APPROVED', 'REFERRED', 'PENDING_CHECKER');

create table credit_reports (
  id bigserial primary key,
  application_id bigint not null unique references applications,
  bureau text not null,
  hit boolean not null,
  score int,
  active_facilities int not null,
  delinquent_facilities int not null,
  monthly_obligations bigint not null,
  pulled_at timestamptz not null default now()
);

create table decisions (
  id bigserial primary key,
  application_id bigint not null unique references applications,
  policy_version text not null,
  outcome text not null check (outcome in ('APPROVE', 'COUNTER', 'REFER', 'DECLINE')),
  score int,
  reasons text[] not null,
  offer_amount bigint,
  offer_tenor int,
  breakdown jsonb not null,
  created_at timestamptz not null default now()
);

create table mandates (
  id bigserial primary key,
  borrower_id bigint not null references borrowers,
  authorization_code text not null unique,
  card_type text not null,
  last4 text not null,
  exp_month int not null,
  exp_year int not null,
  bank text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table loans (
  id bigserial primary key,
  reference text not null unique,
  application_id bigint not null unique references applications,
  borrower_id bigint not null references borrowers,
  product_code text not null references products,
  principal bigint not null check (principal > 0),
  fee bigint not null check (fee >= 0),
  disbursed_amount bigint not null check (disbursed_amount > 0 and disbursed_amount = principal - fee),
  monthly_rate_bps int not null,
  late_fee_bps int not null,
  tenor_months int not null,
  installment_amount bigint not null,
  total_interest bigint not null,
  apr_bps int not null,
  status text not null check (status in ('DISBURSING', 'ACTIVE', 'PAID_OFF', 'WRITTEN_OFF', 'DISBURSEMENT_FAILED')),
  mandate_id bigint references mandates,
  disbursed_on date,
  maturity_date date,
  closed_on date,
  dpd int not null default 0 check (dpd >= 0),
  max_dpd int not null default 0,
  bucket text not null default 'CURRENT' check (bucket in ('CURRENT', 'DPD_1_30', 'DPD_31_60', 'DPD_61_90', 'DPD_90_PLUS')),
  principal_paid bigint not null default 0,
  interest_paid bigint not null default 0,
  fees_paid bigint not null default 0,
  interest_waived bigint not null default 0,
  written_off_amount bigint not null default 0,
  created_at timestamptz not null default now(),
  check (principal_paid between 0 and principal),
  check (status <> 'ACTIVE' or disbursed_on is not null)
);

create unique index one_open_loan on loans (borrower_id) where status in ('DISBURSING', 'ACTIVE');
create index loans_bucket on loans (bucket) where status = 'ACTIVE';

create table installments (
  id bigserial primary key,
  loan_id bigint not null references loans,
  seq int not null,
  due_date date not null,
  principal_due bigint not null check (principal_due >= 0),
  interest_due bigint not null check (interest_due >= 0),
  late_fee_due bigint not null default 0 check (late_fee_due >= 0),
  principal_paid bigint not null default 0,
  interest_paid bigint not null default 0,
  late_fee_paid bigint not null default 0,
  interest_waived bigint not null default 0,
  late_fee_charged boolean not null default false,
  paid_on date,
  unique (loan_id, seq),
  check (principal_paid between 0 and principal_due),
  check (interest_paid between 0 and interest_due),
  check (interest_paid + interest_waived <= interest_due),
  check (paid_on is null or (principal_paid = principal_due and interest_paid + interest_waived = interest_due and late_fee_paid = late_fee_due)),
  check (late_fee_paid between 0 and late_fee_due)
);

create index installments_due on installments (due_date) where paid_on is null;

create table disbursements (
  id bigserial primary key,
  loan_id bigint not null unique references loans,
  reference text not null unique,
  amount bigint not null check (amount > 0),
  bank_code text not null,
  account_number text not null,
  status text not null check (status in ('PENDING', 'SUCCESS', 'FAILED')),
  failure_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table repayments (
  id bigserial primary key,
  loan_id bigint not null references loans,
  reference text not null unique,
  channel text not null check (channel in ('CARD_DEBIT', 'CARD', 'TRANSFER')),
  amount bigint not null check (amount > 0),
  to_late_fees bigint not null,
  to_interest bigint not null,
  to_principal bigint not null,
  to_refund bigint not null,
  received_on date not null,
  recorded_by bigint references staff,
  created_at timestamptz not null default now(),
  check (to_late_fees + to_interest + to_principal + to_refund = amount)
);

create table allocations (
  repayment_id bigint not null references repayments,
  installment_id bigint not null references installments,
  late_fee bigint not null,
  interest bigint not null,
  principal bigint not null,
  primary key (repayment_id, installment_id)
);

create table debit_attempts (
  id bigserial primary key,
  loan_id bigint not null references loans,
  reference text not null unique,
  business_date date not null,
  amount bigint not null check (amount > 0),
  status text not null check (status in ('PENDING', 'SUCCESS', 'FAILED')),
  failure_reason text,
  created_at timestamptz not null default now(),
  unique (loan_id, business_date)
);

create table loan_events (
  id bigserial primary key,
  loan_id bigint not null references loans,
  type text not null,
  amount bigint,
  business_date date not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index loan_events_loan on loan_events (loan_id, id);

create table audit_events (
  id bigserial primary key,
  actor_type text not null check (actor_type in ('STAFF', 'BORROWER', 'SYSTEM')),
  actor_id bigint,
  actor_name text not null,
  action text not null,
  entity text not null,
  entity_id bigint not null,
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);

create index audit_entity on audit_events (entity, entity_id, id);

create table pending_authorizations (
  reference text primary key,
  application_id bigint not null references applications,
  borrower_id bigint not null references borrowers,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table webhook_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

create table business_days (
  business_date date primary key,
  status text not null check (status in ('RUNNING', 'DONE')),
  debits_attempted int not null default 0,
  debits_succeeded int not null default 0,
  late_fees_charged int not null default 0,
  bucket_changes int not null default 0,
  offers_expired int not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table sandbox_clock (
  id int primary key default 1 check (id = 1),
  offset_days int not null default 0 check (offset_days >= 0)
);

insert into sandbox_clock default values;

create trigger decisions_append_only before update or delete on decisions for each row execute function forbid_change();
create trigger repayments_append_only before update or delete on repayments for each row execute function forbid_change();
create trigger allocations_append_only before update or delete on allocations for each row execute function forbid_change();
create trigger loan_events_append_only before update or delete on loan_events for each row execute function forbid_change();
create trigger audit_append_only before update or delete on audit_events for each row execute function forbid_change();

insert into products (code, name, min_amount, max_amount, min_tenor, max_tenor, monthly_rate_bps, fee_bps, late_fee_bps) values
  ('SALARY', 'Salary loan', 2000000, 150000000, 1, 12, 350, 100, 100),
  ('BUSINESS', 'Business loan', 5000000, 300000000, 3, 12, 400, 200, 100),
  ('QUICK', 'Quick cash', 1000000, 10000000, 1, 3, 600, 0, 200);
