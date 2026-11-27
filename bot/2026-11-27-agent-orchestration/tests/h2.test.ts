import { expect, test } from 'vitest';
import { h2 } from '../lib/handoffs';

test('H2', async () => {
  const results = await h2();
  const checks = results.filter(row => row.conclusion !== '记录');
  expect(checks.length).toBeGreaterThan(0);
  for (const result of checks) {
    expect(result.conclusion, JSON.stringify(result)).toBe('支持');
  }
});
