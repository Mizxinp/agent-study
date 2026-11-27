import { expect, test } from 'vitest';
import { h9 } from '../lib/ai-sdk';

test('H9', async () => {
  const results = await h9();
  const checks = results.filter(row => row.conclusion !== '记录');
  expect(checks.length).toBeGreaterThan(0);
  for (const result of checks) {
    expect(result.conclusion, JSON.stringify(result)).toBe('支持');
  }
  expect(results.find(row => row.id === 'H9c')?.data).toMatchObject({ childStoppedBy: 'approval', childApprovalRequests: 1, parentCalls: 2, error: null });
});
