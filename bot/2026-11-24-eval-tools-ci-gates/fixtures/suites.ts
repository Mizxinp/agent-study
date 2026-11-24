const trial = (qid: string, run: number, output: string) => ({
  vars: { qid, trial: run, output },
  assert: [{ type: 'equals', value: 'pass' }],
});

export const suites = {
  h1: Array.from({ length: 10 }, (_, index) =>
    [1, 2, 3].map(run => trial(`q${index + 1}`, run, index === 9 && run > 1 ? 'fail' : 'pass')),
  ).flat(),
  h2: Array.from({ length: 20 }, (_, index) =>
    trial(`q${index + 1}`, 1, index >= 18 ? 'error' : 'pass'),
  ),
  h3: [trial('control', 1, 'pass')],
};
