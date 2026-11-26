alter table products add column id smallserial unique;
alter table products add column updated_at timestamptz not null default now();
alter table products add constraint products_fee_sane check (fee_bps <= 1000 and late_fee_bps <= 1000 and monthly_rate_bps <= 2000);
