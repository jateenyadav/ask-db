// "Chai Bazaar": a made-up online tea & snacks shop, generated deterministically (same data every time,
// so the eval's expected answers never change). Used by the browser (PGlite) and by scripts/eval.mjs.

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CITIES = [['Mumbai', 18], ['Delhi', 16], ['Bengaluru', 15], ['Hyderabad', 10], ['Chennai', 9], ['Pune', 9], ['Kolkata', 8], ['Ahmedabad', 6], ['Jaipur', 5], ['Lucknow', 4]];
const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Krishna', 'Ishaan', 'Rohan', 'Ananya', 'Diya', 'Aadhya', 'Saanvi', 'Myra', 'Ira', 'Kavya', 'Meera', 'Riya', 'Priya', 'Neha', 'Sneha', 'Rahul', 'Karan', 'Zara', 'Imran', 'Farah', 'Joseph', 'Maria', 'Harpreet'];
const LAST = ['Sharma', 'Verma', 'Iyer', 'Reddy', 'Nair', 'Patel', 'Shah', 'Gupta', 'Singh', 'Khan', 'Das', 'Banerjee', 'Menon', 'Joshi', 'Kulkarni', 'Rao', 'Pillai', 'Mehta', 'Chopra', 'Fernandes'];
const PRODUCTS = [
  ['Assam CTC Tea 500g', 'Tea', 240], ['Darjeeling First Flush 100g', 'Tea', 420], ['Masala Chai Blend 250g', 'Tea', 190], ['Nilgiri Green Tea 100g', 'Tea', 260],
  ['Kashmiri Kahwa 100g', 'Tea', 350], ['Tulsi Ginger Tea 25 bags', 'Tea', 160], ['Earl Grey 100g', 'Tea', 310], ['Lemongrass Tea 100g', 'Tea', 210],
  ['Filter Coffee Powder 500g', 'Coffee', 380], ['Chikmagalur Beans 250g', 'Coffee', 450], ['Cold Brew Packs x5', 'Coffee', 299], ['Instant Coffee 100g', 'Coffee', 220],
  ['Khari Biscuits 400g', 'Snacks', 120], ['Bhakarwadi 250g', 'Snacks', 110], ['Banana Chips 200g', 'Snacks', 95], ['Masala Peanuts 300g', 'Snacks', 85],
  ['Rusk Toast 300g', 'Snacks', 70], ['Murukku 250g', 'Snacks', 105], ['Makhana Peri Peri 100g', 'Snacks', 149], ['Nankhatai 300g', 'Snacks', 130],
  ['Elaichi (Cardamom) 50g', 'Spices', 220], ['Saffron 1g', 'Spices', 350], ['Cinnamon Sticks 100g', 'Spices', 140], ['Chai Masala 100g', 'Spices', 120],
  ['Kaju Katli 500g', 'Sweets', 650], ['Soan Papdi 500g', 'Sweets', 220], ['Besan Ladoo 500g', 'Sweets', 380], ['Dry Fruit Barfi 500g', 'Sweets', 720],
  ['Brass Tea Kettle', 'Kitchen', 1450], ['Kulhad Cups set of 6', 'Kitchen', 399], ['Glass Tea Infuser', 'Kitchen', 549], ['Copper Tumbler Pair', 'Kitchen', 899],
  ['Steel Tea Strainer', 'Kitchen', 149], ['Diwali Gift Hamper', 'Gifts', 1999], ['Tea Tasting Box', 'Gifts', 1299], ['Coffee Lover Box', 'Gifts', 1199],
  ['Festive Snack Box', 'Gifts', 899], ['Corporate Gift Set', 'Gifts', 2999], ['Chai Starter Kit', 'Gifts', 999], ['Sweet Tooth Box', 'Gifts', 1099],
];

const pickW = (r, list) => {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of list) if ((x -= w) < 0) return v;
  return list.at(-1)[0];
};
const iso = (d) => d.toISOString().slice(0, 10);
const START = Date.UTC(2025, 5, 1); // 2025-06-01
const END = Date.UTC(2026, 9, 31); // 2026-10-31
const DAY = 86400000;

export function sampleData() {
  const r = rng(20261113);
  const products = PRODUCTS.map(([name, category, price], i) => ({ id: i + 1, name, category, price }));
  const customers = Array.from({ length: 300 }, (_, i) => ({
    id: i + 1,
    name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
    city: pickW(r, CITIES),
    signup_date: iso(new Date(START + Math.floor(r() * ((END - START) / DAY - 30)) * DAY)),
  }));
  const orders = [];
  const items = [];
  let itemId = 1;
  for (let i = 1; orders.length < 2000; i++) {
    const c = customers[Math.floor(r() * customers.length)];
    const from = Date.parse(c.signup_date);
    let t = from + Math.floor(r() * ((END - from) / DAY + 1)) * DAY;
    // Diwali rush: extra orders pulled into 15–31 October 2026
    if (r() < 0.12) t = Date.UTC(2026, 9, 15 + Math.floor(r() * 17));
    if (t < from) continue;
    const date = iso(new Date(t));
    const status = pickW(r, [['delivered', 85], ['cancelled', 7], ['returned', 4], ['shipped', 4]]);
    const channel = pickW(r, [['app', 55], ['web', 35], ['whatsapp', 10]]);
    const id = orders.length + 1;
    orders.push({ id, customer_id: c.id, order_date: date, status, channel });
    const n = 1 + Math.floor(r() * r() * 4);
    const used = new Set();
    for (let k = 0; k < n; k++) {
      const festive = date >= '2026-10-15' && r() < 0.35;
      const p = festive ? products[33 + Math.floor(r() * 7)] : products[Math.floor(r() * products.length)];
      if (used.has(p.id)) continue;
      used.add(p.id);
      const discount = r() < 0.2 ? 0.9 : 1;
      items.push({ id: itemId++, order_id: id, product_id: p.id, quantity: 1 + Math.floor(r() * r() * 3), unit_price: Math.round(p.price * discount) });
    }
  }
  return { customers, products, orders, order_items: items };
}

const lit = (v) => (typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const insert = (table, rows) => {
  const cols = Object.keys(rows[0]);
  const out = [];
  for (let i = 0; i < rows.length; i += 500) {
    out.push(`INSERT INTO ${table} (${cols.join(', ')}) VALUES\n${rows.slice(i, i + 500).map((r) => `(${cols.map((c) => lit(r[c])).join(', ')})`).join(',\n')};`);
  }
  return out.join('\n');
};

/** SQL that creates and fills the sample database. */
export function sampleSql() {
  const d = sampleData();
  return `
CREATE TABLE customers (id integer PRIMARY KEY, name text NOT NULL, city text NOT NULL, signup_date date NOT NULL);
CREATE TABLE products (id integer PRIMARY KEY, name text NOT NULL, category text NOT NULL, price numeric(10,2) NOT NULL);
CREATE TABLE orders (id integer PRIMARY KEY, customer_id integer NOT NULL REFERENCES customers(id), order_date date NOT NULL, status text NOT NULL, channel text NOT NULL);
CREATE TABLE order_items (id integer PRIMARY KEY, order_id integer NOT NULL REFERENCES orders(id), product_id integer NOT NULL REFERENCES products(id), quantity integer NOT NULL, unit_price numeric(10,2) NOT NULL);
COMMENT ON TABLE orders IS 'One row per order. status: delivered, cancelled, returned or shipped. channel: app, web or whatsapp.';
COMMENT ON TABLE order_items IS 'Lines of an order. Line revenue = quantity * unit_price (unit_price already includes any discount).';
${insert('customers', d.customers)}
${insert('products', d.products)}
${insert('orders', d.orders)}
${insert('order_items', d.order_items)}
`;
}
