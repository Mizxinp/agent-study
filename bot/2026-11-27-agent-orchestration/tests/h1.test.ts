import { expect, test } from 'vitest';
import { h1 } from '../lib/handoffs';

test('H1', async () => {
  const results = await h1();
  const checks = results.filter(row => row.conclusion !== '记录');
  expect(checks.length).toBeGreaterThan(0);
  for (const result of checks) {
    expect(result.conclusion, JSON.stringify(result)).toBe('支持');
  }
  expect(results.find(row => row.id === 'H1d')?.data).toMatchObject({ target: 'Refund agent', executions: 0 });
});
