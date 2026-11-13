import { test, expect } from '@playwright/test';

test('demo → ask → chart → save → saved re-run → CSV upload → auto-fix, no console errors', async ({ page }, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Ask your data/ })).toBeVisible();
  await page.screenshot({ path: `test-results/landing-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Try the demo' }).click();

  await expect(page.getByTestId('tables')).toContainText('order_items', { timeout: 30000 });
  await page.locator('form').getByRole('button', { name: 'Which 5 cities spend the most?' }).click();
  const first = page.getByTestId('answers').locator('li').first();
  await expect(first.getByTestId('chart-bar')).toBeVisible({ timeout: 20000 });
  await expect(first.getByTestId('result-table')).toContainText('Mumbai');
  await expect(first.getByTestId('sql')).toContainText('GROUP BY c.city', { useInnerText: false });

  await first.getByRole('button', { name: '☆ Save' }).click();
  await expect(page.getByTestId('saved').locator('li')).toHaveCount(4);
  await page.getByTestId('saved').getByRole('button', { name: 'What share of orders were cancelled?', exact: true }).click();
  await expect(page.getByTestId('answers').locator('li').first().getByTestId('chart-number')).toBeVisible();
  await page.screenshot({ path: `test-results/answers-${info.project.name}.png`, fullPage: true });

  const csv = 'Student Name,Marks,Exam Date,Passed\nAsha,91,2026-03-01,yes\nRavi,"78",2026-03-01,yes\nMeera,34,2026-03-02,no\n';
  await page.getByTestId('csv-input').setInputFiles({ name: 'Class Results.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByTestId('tables')).toContainText('class_results');
  await expect(page.getByText('Added table "class_results" (3 rows, 4 columns)')).toBeVisible();

  await page.getByLabel('Your question').fill('BREAK_IT on purpose');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByText('auto-fixed ×1')).toBeVisible({ timeout: 20000 });

  expect(errors).toEqual([]);
});
