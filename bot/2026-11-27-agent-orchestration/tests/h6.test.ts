import { expect, test } from 'vitest';
import { h6 } from '../lib/resume';

test('H6', async () => {
  const results = await h6();
  const checks = results.filter(row => row.conclusion !== '记录');
  expect(checks.length).toBeGreaterThan(0);
  for (const result of checks) {
    expect(result.conclusion, JSON.stringify(result)).toBe(result.id === 'H6b' || result.id === 'H6d' ? '不支持' : '支持');
  }
  expect(results.find(row => row.id === 'H6b')?.data).toMatchObject({ schema: '1.23' });
  expect(results.find(row => row.id === 'H6d')?.data).toMatchObject({
    ledgerRows: 0, error: null, refundCalls: 0, restoredInterruptionAgents: ['Manager agent'],
    remaining: 0, interruptionAgents: [],
  });
});
