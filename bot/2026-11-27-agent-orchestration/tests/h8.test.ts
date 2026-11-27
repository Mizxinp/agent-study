import { expect, test } from 'vitest';
import { h8 } from '../lib/ai-sdk';

test('H8', async () => {
  const results = await h8();
  const checks = results.filter(row => row.conclusion !== '记录');
  expect(checks.length).toBeGreaterThan(0);
  for (const result of checks) {
    expect(result.conclusion, JSON.stringify(result)).toBe('支持');
  }
  expect(results.find(row => row.id === 'H8c.unsigned')?.data).toMatchObject({ amounts: [9999], error: null });
});
