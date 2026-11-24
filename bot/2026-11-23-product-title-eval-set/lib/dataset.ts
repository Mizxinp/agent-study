import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gradeTitle, type GradeInput } from './grader';

type Gold = Pick<GradeInput, 'compliance_should_fail'> & {
  faithfulness: boolean;
  coverage: boolean;
  length: boolean;
  style: boolean;
};

export type Fixture = Omit<GradeInput, 'compliance_should_fail'> & {
  id: string;
  split: 'dev' | 'holdout';
  gold: Gold;
  slices: Record<'faithfulness' | 'coverage' | 'length' | 'compliance' | 'style', string>;
  context?: string;
};

export function loadFrozenData(directory = join(process.cwd(), 'data')) {
  const bytes = readFileSync(join(directory, 'titles.jsonl'));
  const freeze = JSON.parse(readFileSync(join(directory, 'freeze.json'), 'utf8'));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== freeze.sha256) throw new Error('Frozen dataset SHA-256 mismatch');
  const fixtures = bytes.toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line) as Fixture);
  if (fixtures.length !== freeze.count) throw new Error('Frozen dataset row count mismatch');
  return { fixtures, freeze };
}

export function gradeFixture(fixture: Fixture) {
  return gradeTitle({ ...fixture, compliance_should_fail: fixture.gold.compliance_should_fail });
}
