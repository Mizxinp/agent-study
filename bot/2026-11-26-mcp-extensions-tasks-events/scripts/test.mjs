import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

for (const cap of ['extensions', 'legacy', 'none']) {
  const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run'], {
    stdio: 'inherit', env: { ...process.env, DEMO_PHASE: cap },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
rmSync('.data', { recursive: true, force: true });
