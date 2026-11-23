import h3 from '../promptfoo/result.json';
import { describe, expect, it } from 'vitest';
import { analyze } from './analysis';
import { gradeFixture, loadFrozenData } from './dataset';
import { gradeTitle, type GradeInput } from './grader';

const base: GradeInput = {
  attributes: { capacity: 250, size: 12, material: '白瓷', count: 2 },
  required: ['capacity', 'size', 'material', 'count'],
  title: '２件 白瓷 120毫米 0.25L',
  maxChars: 28,
  compliance_should_fail: false,
};

describe('gradeTitle', () => {
  it.each(['250mL', '250ml', '250毫升', '0.25L', '０．２５升'])('normalizes %s', capacity => {
    expect(gradeTitle({ ...base, title: `白瓷 ${capacity} 120毫米 2只` }).pass).toBe(true);
  });

  it('rejects unsupported extra claims even when all required fields are covered', () => {
    const result = gradeTitle({ ...base, title: base.title + ' 300ml 骨瓷 星杯银奖', maxChars: 80 });
    expect(result.coverage).toBe(true);
    expect(result.unsupported).toEqual(['骨瓷', '300ml', '银奖']);
    expect(result.pass).toBe(false);
  });

  it('rejects a claim with no input attribute and a missing required field', () => {
    const result = gradeTitle({ ...base, attributes: { material: '白瓷' }, title: '白瓷 2只' });
    expect(result.unsupported).toEqual(['2只']);
    expect(result.missing).toEqual(['capacity', 'size', 'count']);
    expect(result.pass).toBe(false);
  });

  it('keeps flags separate from the compliance gate and counts Unicode code points', () => {
    const title = '🥛最好';
    const input = { ...base, title, required: [], maxChars: 3 };
    expect(gradeTitle(input)).toMatchObject({ chars: 3, flag_absolute_terms: true, pass: true });
    expect(gradeTitle({ ...input, compliance_should_fail: true }).pass).toBe(false);
    expect(gradeTitle({ ...input, maxChars: 2 }).pass).toBe(false);
  });
});

describe('frozen regressions', () => {
  const { fixtures, freeze } = loadFrozenData();
  const results = analyze(fixtures);

  it('verifies the frozen hash, unique IDs, split isolation and every hard gold label', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(24);
    expect(new Set(fixtures.map(row => row.id)).size).toBe(fixtures.length);
    for (let index = 0; index < fixtures.length; index += 2) {
      expect(fixtures[index].split).toBe(fixtures[index + 1].split);
    }
    expect(results.regressions).toEqual([]);
  });

  it('produces the same grades with swapped IDs and fixture-free calls', () => {
    for (const [index, fixture] of fixtures.entries()) {
      const { attributes, required, title, maxChars, gold } = fixture;
      expect(gradeFixture({ ...fixture, id: fixtures[(index + 1) % fixtures.length].id }))
        .toEqual(gradeFixture(fixture));
      expect(gradeTitle({ attributes, required, title, maxChars, compliance_should_fail: gold.compliance_should_fail }))
        .toEqual(gradeFixture(fixture));
    }
  });

  it('reproduces the H2 disagreements', () => {
    const markedOnly = results.compliance.filter(row => row.flag_absolute_terms && !row.compliance_should_fail);
    expect(markedOnly.map(row => row.slice)).toEqual(['philosophy', 'self_comparison', 'trademark', 'scoped_citation']);
    expect(results.compliance.find(row => row.slice === 'scope_too_narrow'))
      .toMatchObject({ flag_absolute_terms: true, compliance_should_fail: true });
  });

  it('matches the saved H3 hard result and verifies the CLI export summary', () => {
    const fixture = results.rows.find(row => row.id === h3.typescript.id);
    expect(h3.typescript).toEqual({
      datasetSha256: freeze.sha256,
      id: fixture?.id,
      title: fixture?.title,
      ...fixture?.result,
    });
    expect(h3.typescript.pass).toBe(false);
    expect(h3.promptfoo).toMatchObject({
      version: '0.126.0',
      provider: 'echo',
      output: fixture?.title,
      success: true,
      threshold: 0.75,
      score: 0.8,
    });
    expect(h3.promptfoo.assertions).toContainEqual({
      metric: 'faithfulness', pass: false, score: 0, weight: 1,
    });
  });
});
