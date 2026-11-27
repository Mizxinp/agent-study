import { expect, test } from 'vitest';
import { h10 } from '../lib/http-experiment';

test('H10', async () => {
  const results = await h10();
  const checks = results.filter(row => row.conclusion !== '记录');
  expect(checks.length).toBeGreaterThan(0);
  for (const result of checks) {
    expect(result.conclusion, JSON.stringify(result)).toBe('支持');
  }
});
