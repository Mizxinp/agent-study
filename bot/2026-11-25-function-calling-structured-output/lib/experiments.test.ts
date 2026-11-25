import { expect, test } from 'vitest';
import { experiments, runExperiment, type Hypothesis } from './experiments';

test.each(Object.keys(experiments) as Hypothesis[])('%s', async id => {
  const result = await runExperiment(id);
  expect(result.error, JSON.stringify(result.requests, null, 2)).toBeUndefined();
  expect(result.checks.filter(check => !check.pass)).toEqual([]);
});
