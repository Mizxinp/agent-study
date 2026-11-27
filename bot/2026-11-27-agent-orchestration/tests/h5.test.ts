import { expect, test } from 'vitest';
import { h5 } from '../lib/handoffs';

test('H5', async () => {
  const results = await h5();
  const checks = results.filter(row => row.conclusion !== '记录');
  expect(checks.length).toBeGreaterThan(0);
  for (const result of checks) {
    expect(result.conclusion, JSON.stringify(result)).toBe('支持');
  }
});
