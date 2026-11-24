import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeFixtures } from './experiments';
import { analyzeFrozen, verifyFrozen } from './frozen';
import { four, gate, wilson } from './statistics';

const root = fileURLToPath(new URL('../', import.meta.url));

describe('离线评测闸门', () => {
  const { h1, h2, h3 } = analyzeFixtures(root);

  it('以官方 2/3 样例核对 Wilson 区间', () => {
    expect(wilson(2, 3).map(four)).toEqual(['0.2077', '0.9385']);
    expect(h1.wilson.map(four)).toEqual(['0.0615', '0.7923']);
  });

  it('展开、至少一次、三次全对在相同阈值下可给出不同结论', () => {
    expect(h1.cli).toEqual({ rate: 28 / 30, gate: '失败', exitCode: 100 });
    expect(h1.passAt3).toEqual({ rate: 1, gate: '通过' });
    expect(h1.passAll3).toEqual({ rate: 9 / 10, gate: '失败' });
    expect(gate(0.95)).toBe('通过');
    expect(gate(0.94999)).toBe('失败');
  });

  it('文档 jq 跳过错误，CLI 将错误计入分母', () => {
    expect(h2.counts).toEqual({ successes: 18, failures: 0, errors: 2 });
    expect(h2.jq).toBe(18 / 18);
    expect(h2.cli).toBe(18 / 20);
    expect([h2.jqGate, h2.cliGate, h2.exitCode]).toEqual(['通过', '失败', 100]);
  });

  it('H3 普通命令通过，未知选项被拒绝', () => {
    expect([h3.controlExitCode, h3.accepted, h3.exitCode]).toEqual([0, false, 1]);
  });
});

describe('2.3 冻结数据', () => {
  it('核验 SHA-256 和 Git blob，并拒绝改动后的字节', () => {
    const bytes = readFileSync(`${root}/data/results.json`);
    expect(verifyFrozen(bytes)).toEqual({
      sha256: '067821e5a441e8a9f15292faf06c9d5e2a38b30ad145400b927a5f89a530aa5f',
      blob: 'fd761b71959e7bfdf7f5728c9d074aca3b7abed0',
    });
    bytes[0] ^= 1;
    expect(() => verifyFrozen(bytes)).toThrow('哈希不符');
  });

  it('两个切片逐项复现 3.1 的指标和 bootstrap 宽度', () => {
    const { slices } = analyzeFrozen(root);
    expect(slices.map(({ slice, actual }) => [slice, actual])).toEqual([
      ['all/fixed', ['0.7667', '0.8000', '0.7250', '0.1500', '0.2417']],
      ['multi/fixed', ['0.4048', '0.4286', '0.3571', '0.2857', '0.4762']],
    ]);
  });
});
