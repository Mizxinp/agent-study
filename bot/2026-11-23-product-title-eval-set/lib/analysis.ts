import { gradeFixture, type Fixture } from './dataset';

export function analyze(fixtures: Fixture[]) {
  const rows = fixtures.map(fixture => ({ ...fixture, result: gradeFixture(fixture) }));
  const hits = rows.filter(row => !row.gold.faithfulness && !row.result.faithfulness);
  const misses = rows.filter(row => !row.gold.faithfulness && row.result.faithfulness);
  const falsePositives = rows.filter(row => row.gold.faithfulness && !row.result.faithfulness);
  const reordered = rows.filter(row => row.slices.faithfulness === 'reordered');
  const compliance = rows.map(({ id, title, slices, result }) => ({
    id, title, slice: slices.compliance,
    flag_absolute_terms: result.flag_absolute_terms,
    compliance_should_fail: result.compliance_should_fail,
  }));
  const regressions = rows.filter(({ gold, result }) => {
    const expectedPass = gold.faithfulness && gold.coverage && gold.length && !gold.compliance_should_fail;
    return result.pass !== expectedPass ||
      result.faithfulness !== gold.faithfulness ||
      result.coverage !== gold.coverage ||
      result.length !== gold.length;
  });
  return { rows, hits, misses, falsePositives, reordered, compliance, regressions };
}
