import { analyzeFixtures } from '../lib/experiments';
import { analyzeFrozen } from '../lib/frozen';
import { four, gate } from '../lib/statistics';

const percent = (rate: number) => `${(rate * 100).toFixed(2)}%`;
const interval = ({ lower, upper, width }: { lower: number; upper: number; width: number }) =>
  `[${four(lower)}, ${four(upper)}] · ${four(width)}`;

export default function Page() {
  const root = process.cwd();
  const { version, h1, h2, h3 } = analyzeFixtures(root);
  const { slices } = analyzeFrozen(root);
  const gates = [
    ['H1 · CLI 展开通过率', h1.cli.rate, h1.cli.exitCode],
    ['H1 · 按题 pass@3', h1.passAt3.rate],
    ['H1 · 按题 pass^3', h1.passAll3.rate],
    ['H2 · CLI 含错误行', h2.cli, h2.exitCode],
    ['H2 · 文档 jq', h2.jq],
  ] as const;

  return (
    <main style={{ maxWidth: 960, margin: '48px auto', padding: '0 20px', font: '16px/1.6 system-ui' }}>
      <h1>3.2 评测工具与 CI 闸门</h1>
      <p>Promptfoo {version} · 冻结离线回放 · 阈值 95%</p>
      <section>
        <h2>H1–H2 通过率闸门</h2>
        <table cellPadding={8}>
          <thead><tr><th>口径</th><th>通过率</th><th>闸门</th><th>CLI 实跑退出码</th></tr></thead>
          <tbody>{gates.map(([label, rate, exit]) => (
            <tr key={label}>
              <th scope="row">{label}</th><td>{percent(rate)}</td>
              <td style={{ color: gate(rate) === '通过' ? '#166534' : '#b91c1c' }}>{gate(rate)}</td>
              <td>{exit ?? '—'}</td>
            </tr>
          ))}</tbody>
        </table>
        <p>H1 {h1.unstableQid} 通过 1/3，Wilson 95% 区间 [{h1.wilson.map(four).join(', ')}]。</p>
      </section>
      <section>
        <h2>H3 CLI 选项</h2>
        <p>普通命令退出 {h3.controlExitCode}。加入 <code>--fail-on-error</code> 后退出 {h3.exitCode}。</p>
        <p><code>{h3.stderr.split('\n')[0]}</code></p>
      </section>
      <section>
        <h2>H4 2.3 冻结数据重算</h2>
        <div style={{ overflowX: 'auto' }}>
          <table cellPadding={8}>
            <thead>
              <tr><th>切片</th><th>单次</th><th>pass@3</th><th>pass^3</th>
                <th>按 trial 区间 · 宽度</th><th>按题区间 · 宽度</th></tr>
            </thead>
            <tbody>{slices.map(row => (
              <tr key={row.slice}>
                <th scope="row">{row.slice}</th><td>{four(row.single)}</td>
                <td>{four(row.passAt3)}</td><td>{four(row.passAll3)}</td>
                <td>{interval(row.trialInterval)}</td><td>{interval(row.questionInterval)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
