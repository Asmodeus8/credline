const API = process.env.API_URL ?? "http://localhost:8080";
const WEEKS = Number(process.env.WEEKS ?? 26);

let s = Number(process.env.SEED ?? 20261125);
const rand = () => {
  s |= 0;
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (a) => a[Math.floor(rand() * a.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const digits = (n) => Array.from({ length: n }, () => between(0, 9)).join("");

const FIRST = ["Adaeze", "Tunde", "Ngozi", "Emeka", "Funmilayo", "Chinedu", "Aisha", "Ibrahim", "Kemi", "Segun", "Chiamaka", "Yusuf", "Bisi", "Obinna", "Zainab", "Femi", "Amaka", "Musa", "Tolu", "Ifeanyi", "Halima", "Dapo", "Uche", "Bola", "Nkechi", "Sani", "Yemi", "Ebuka", "Hauwa", "Kunle", "Ronke", "Chidi", "Fatima", "Wale", "Ada", "Gbenga", "Ify", "Bashir", "Lola", "Nnamdi"];
const LAST = ["Okafor", "Adeyemi", "Okonkwo", "Bello", "Eze", "Ogunleye", "Abubakar", "Nwosu", "Balogun", "Ibrahim", "Obi", "Adebayo", "Danjuma", "Okoro", "Lawal", "Chukwu", "Afolabi", "Usman", "Onyeka", "Salami", "Mohammed", "Akinola", "Nwachukwu", "Oladipo", "Garba", "Ekwueme", "Fashola", "Yakubu"];
const EMPLOYERS = ["Dangote Cement", "MTN Nigeria", "Access Bank", "Lagos State Government", "Andela", "Nestle Nigeria", "Federal Ministry of Health", "Jumia", "Flour Mills", "Shoprite", "Total Energies", "University of Lagos"];
const BUSINESSES = ["Mama Put Kitchen", "Ade Phones and Accessories", "Bello Fabrics", "Chi Pharmacy", "Okon Auto Spares", "Zee Beauty Studio", "Iya Basira Provisions"];
const BANKS = ["044", "058", "011", "033", "057", "070", "50211", "999992", "100004"];
const PURPOSES = ["Rent", "School fees", "Medical", "Stock for business", "Equipment", "Travel", "Emergency", "Wedding"];

class Client {
  cookie = "";
  async call(method, path, body) {
    const res = await fetch(API + path, {
      method,
      headers: { "Content-Type": "application/json", ...(this.cookie && { Cookie: this.cookie }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const text = await res.text();
    const data = text ? JSON.parse(text) : undefined;
    return { status: res.status, data };
  }
  get(path) {
    return this.call("GET", path);
  }
  post(path, body = {}) {
    return this.call("POST", path, body);
  }
}

async function staff(email) {
  const c = new Client();
  const r = await c.post("/api/auth/staff", { email, password: "credline-demo" });
  if (r.status !== 200) throw new Error(`staff login ${email}: ${r.status}`);
  return c;
}

const ada = await staff("ada@credline.ng");
const kunle = await staff("kunle@credline.ng");
const tunde = await staff("tunde@credline.ng");
const borrowers = [];
let final = false;
const stats = { applied: 0, approved: 0, referred: 0, declined: 0, accepted: 0, repeat: 0 };

function profile() {
  const roll = rand();
  const employment = roll < 0.42 ? "SALARIED" : roll < 0.6 ? "CIVIL_SERVANT" : roll < 0.92 ? "SELF_EMPLOYED" : "UNEMPLOYED";
  const income = employment === "UNEMPLOYED" ? between(0, 4) * 1_000_000 : (rand() < 0.12 ? between(1, 3) : between(6, 90)) * 1_000_000;
  const bureau = pick([5, 6, 7, 8, 9, 5, 6, 7, 8, 9, 6, 8, 3, 3, 4, 4, 2, 2, 1, 1, 0, 0, 0]);
  return {
    firstName: pick(FIRST),
    lastName: pick(LAST),
    phone: `0${pick(["70", "80", "81", "90", "91"])}${digits(8)}`,
    bvn: `22${digits(8)}${bureau}`,
    dateOfBirth: `${between(1968, 2004)}-${String(between(1, 12)).padStart(2, "0")}-${String(between(1, 28)).padStart(2, "0")}`,
    employment,
    employer: employment === "SELF_EMPLOYED" ? pick(BUSINESSES) : employment === "UNEMPLOYED" ? null : pick(EMPLOYERS),
    monthlyIncome: income,
    bankCode: pick(BANKS),
    accountNumber: `${between(1, 9)}${digits(8)}${between(1, 9)}`,
    pin: "1234",
  };
}

function loanFor(p) {
  const r = rand();
  if (p.employment === "SELF_EMPLOYED" && r < 0.6) return { product: "BUSINESS", amount: between(10, 60) * 5_000_000, tenor: between(3, 12) };
  if (r < 0.2) return { product: "QUICK", amount: between(2, 20) * 500_000, tenor: between(1, 3) };
  return { product: "SALARY", amount: between(4, 60) * 500_000 * 5, tenor: between(2, 9) };
}

function card() {
  const r = rand();
  return r < 0.7 ? "reliable" : r < 0.88 ? "late" : "declined";
}

async function accept(client, appId) {
  const r = await client.post(`/api/me/applications/${appId}/accept`);
  if (r.status !== 200) return;
  stats.accepted++;
  if (r.data.checkoutUrl) {
    const ref = r.data.checkoutUrl.split("/").pop();
    await new Client().post(`/api/sandbox/checkout/${ref}`, { card: card() });
  }
}

async function review(app, client) {
  const officer = rand() < 0.5 ? ada : kunle;
  const r = rand();
  if (r < 0.2) {
    await officer.post(`/api/console/applications/${app.id}/decline`, { note: pick(["Income not supported by statement", "Employer could not be verified", "Recent bounced cheques on statement"]) });
    return;
  }
  const proposed = Math.min(app.amount, Math.max(app.offerAmount ?? app.amount, app.amount * (0.6 + rand() * 0.4)));
  const amount = Math.round(proposed / 500_000) * 500_000;
  const note = pick(["Six months of statements reviewed", "Employer confirmed by phone", "Salary account with steady inflows", "Guarantor details on file"]);
  const tenor = app.offerTenor ?? app.tenorMonths;
  let res = await officer.post(`/api/console/applications/${app.id}/approve`, { amount, tenor, note });
  if (res.status === 422 && app.offerAmount) res = await officer.post(`/api/console/applications/${app.id}/approve`, { amount: app.offerAmount, tenor, note });
  if (res.status !== 200) return;
  if (res.data?.status === "PENDING_CHECKER") {
    if (rand() < 0.85) await tunde.post(`/api/console/applications/${app.id}/confirm`);
    else return;
  }
  if (rand() < 0.9) await accept(client, app.id);
}

async function newcomer() {
  const p = profile();
  const client = new Client();
  const r = await client.post("/api/applications", { borrower: p, loan: { ...loanFor(p), purpose: pick(PURPOSES) } });
  if (r.status !== 201) return;
  stats.applied++;
  borrowers.push({ phone: p.phone, client });
  await handle(r.data, client);
}

async function handle(app, client) {
  if (app.status === "APPROVED") {
    stats.approved++;
    if (!final && rand() < 0.88) await accept(client, app.id);
  } else if (app.status === "REFERRED") {
    stats.referred++;
    if (!final && rand() < 0.85) await review(app, client);
  } else stats.declined++;
}

async function repeat() {
  const candidates = borrowers.filter((b) => b.free !== false);
  if (!candidates.length) return;
  const b = pick(candidates);
  const me = await b.client.get("/api/me");
  if (me.status !== 200) return;
  const busy = me.data.loans.some((l) => ["ACTIVE", "DISBURSING"].includes(l.status)) || me.data.applications.some((a) => ["APPROVED", "REFERRED", "PENDING_CHECKER"].includes(a.status));
  const paid = me.data.loans.some((l) => l.status === "PAID_OFF");
  if (busy || !paid) return;
  const r = await b.client.post("/api/me/applications", { product: rand() < 0.7 ? "SALARY" : "BUSINESS", amount: between(20, 90) * 1_000_000, tenor: between(4, 12), purpose: pick(PURPOSES) });
  if (r.status !== 201) return;
  stats.applied++;
  stats.repeat++;
  await handle(r.data, b.client);
}

async function manualPayments() {
  const late = await ada.get("/api/console/loans?status=ACTIVE&bucket=DPD_1_30");
  for (const l of late.data ?? []) {
    if (rand() < 0.35) {
      const loan = await ada.get(`/api/console/loans/${l.id}`);
      if (loan.data?.overdue > 0) await ada.post(`/api/console/loans/${l.id}/repayments`, { amount: loan.data.overdue, reference: `NIP${digits(18)}` });
    }
  }
}

for (let week = 0; week < WEEKS; week++) {
  const arrivals = between(5, 9) + Math.floor(week / 4);
  for (let i = 0; i < arrivals; i++) await newcomer();
  for (let i = 0; i < Math.floor(week / 3); i++) await repeat();
  if (week % 2 === 1) await manualPayments();
  const days = week === WEEKS - 1 ? 3 : 7;
  const adv = await tunde.post("/api/sandbox/clock/advance", { days });
  console.log(`week ${week + 1}: ${adv.data.today}, ${adv.data.debitsSucceeded}/${adv.data.debitsAttempted} debits, ${adv.data.bucketChanges} bucket moves`);
}

final = true;
for (let i = 0; i < 8; i++) await newcomer();

const writeOff = await tunde.get("/api/console/loans?status=ACTIVE&bucket=DPD_90_PLUS");
for (const l of (writeOff.data ?? []).slice(0, 2)) await tunde.post(`/api/console/loans/${l.id}/write-off`, { note: "No contact after 90 days; handed to recoveries agent" });

const o = await ada.get("/api/console/overview");
console.log(JSON.stringify({ stats, portfolio: o.data.portfolio, queue: o.data.queue }, null, 2));
