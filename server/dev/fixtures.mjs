// Canned answers for the fake AI (local dev + tests). Order matters: the first key found wins.
const cities = {
  sql: "SELECT c.city, ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue FROM orders o JOIN customers c ON c.id = o.customer_id JOIN order_items oi ON oi.order_id = o.id WHERE o.status = 'delivered' GROUP BY c.city ORDER BY revenue DESC LIMIT 10;",
  explanation: 'Joins orders, customers and order lines, keeps delivered orders and ranks cities by revenue.',
  chart: { type: 'bar', x: 'city', y: 'revenue', title: 'Revenue by city' },
};
export default {
  'This query failed': cities, // the fix step always returns a working query
  'BREAK_IT': { sql: 'SELECT citty FROM customers', explanation: 'Typo on purpose.', chart: { type: 'table' } },
  'DESTROY_IT': { sql: 'WITH d AS (DELETE FROM orders RETURNING *) SELECT * FROM d', explanation: 'Should be blocked.', chart: { type: 'table' } },
  'Question:': cities,
};
