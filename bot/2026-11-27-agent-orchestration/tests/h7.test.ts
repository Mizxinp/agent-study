import { expect, test } from 'vitest';
import { h7 } from '../lib/resume';

test('H7', async () => {
  const results = await h7();
  expect(results.map(({ conclusion }) => conclusion)).toEqual(['SDK 检出', '未检出', 'SDK 检出']);
  expect(results.map(({ data }) => data.amounts)).toEqual([[], [9999], []]);
});
