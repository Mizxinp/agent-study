import { expect, test } from 'vitest';
import { h4 } from '../lib/handoffs';

test('H4', async () => {
  const results = await h4();
  const checks = results.filter(row => row.conclusion !== '记录');
  expect(checks.length).toBeGreaterThan(0);
  for (const result of checks) {
    expect(result.conclusion, JSON.stringify(result)).toBe('支持');
  }
  expect(results.find(row => row.id === 'H4c')?.data).toMatchObject({ target: 'Refund agent', orders: 0, refundSawMessage: true });
});
