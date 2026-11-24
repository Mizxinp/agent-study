import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { suites } from '../fixtures/suites';
import { readExport } from '../lib/experiments';

const root = fileURLToPath(new URL('../', import.meta.url));
const packageDir = join(root, 'node_modules/promptfoo');
const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
if (pkg.version !== '0.126.0') throw new Error(`Unexpected Promptfoo version: ${pkg.version}`);

const output = process.argv[2];
if (!output) throw new Error('Usage: pnpm replay <log directory>');
const logRoot = resolve(output);
const cache = join(root, '.promptfoo');
mkdirSync(cache, { recursive: true });

const cases = [
  { name: 'h1', suite: 'h1', exit: 100 },
  { name: 'h2', suite: 'h2', exit: 100 },
  { name: 'h3-control', suite: 'h3', exit: 0 },
  { name: 'h3', suite: 'h3', exit: 1 },
] as const;

for (const { name, suite, exit } of cases) {
  const cwd = mkdtempSync(join(cache, `${name}-`));
  const logs = join(logRoot, name);
  mkdirSync(logs, { recursive: true });
  copyFileSync(join(root, 'fixtures/replay.cjs'), join(cwd, 'replay.cjs'));
  const config = {
    prompts: ['{{output}}'],
    providers: [suite === 'h2' ? 'file://./replay.cjs' : 'echo'],
    tests: suites[suite],
  };
  writeFileSync(join(cwd, 'suite.json'), JSON.stringify(config, null, 2));
  const args = [
    join(packageDir, pkg.bin.promptfoo), 'eval',
    ...(name === 'h3' ? ['--fail-on-error'] : []),
    '-c', 'suite.json', '-o', 'export.json',
    '--no-cache', '--no-share', '--no-write', '--no-progress-bar',
  ];
  const result = spawnSync(process.execPath, args, {
    cwd,
    env: {
      PATH: process.env.PATH,
      HOME: cwd,
      CI: '1',
      NODE_ENV: 'production',
      PROMPTFOO_DISABLE_TELEMETRY: '1',
      PROMPTFOO_DISABLE_UPDATE: '1',
      PROMPTFOO_PASS_RATE_THRESHOLD: '95',
    },
    encoding: 'utf8',
  });
  const observation = {
    version: pkg.version,
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    exported: existsSync(join(cwd, 'export.json')),
  };
  writeFileSync(join(logs, 'command.json'), JSON.stringify({ cwd, executable: process.execPath, args }, null, 2));
  writeFileSync(join(logs, 'exit-code.txt'), `${result.status}\n`);
  writeFileSync(join(logs, 'stdout.txt'), result.stdout ?? '');
  writeFileSync(join(logs, 'stderr.txt'), result.stderr ?? '');
  if (observation.exported) copyFileSync(join(cwd, 'export.json'), join(logs, 'export.json'));
  console.log(`${name}: Promptfoo ${pkg.version}, exit ${result.status}, export ${observation.exported}`);
  if (result.error) throw result.error;
  if (result.status !== exit || observation.exported !== (name !== 'h3')) {
    throw new Error(`Unexpected replay result for ${name}; see ${logs}`);
  }
  if (name !== 'h3') readExport(join(logs, 'export.json'), name);
  if (name === 'h3') {
    writeFileSync(join(logRoot, 'h3-output.json'), JSON.stringify(observation, null, 2) + '\n');
  }
}
