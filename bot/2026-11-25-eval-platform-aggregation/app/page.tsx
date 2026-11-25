import { analyze } from '../lib/experiment';

const percentage = (value: number) => `${(value * 100).toFixed(2)}%`;

export default function Home() {
  const { H1, H2, H3, H4, H5 } = analyze();
  return (
    <main>
      <header>
        <h1>重复试验与评测聚合</h1>
        <p>LangSmith / Braintrust JS · 冻结 0/1 结果</p>
      </header>

      <section>
        <h2>H2 · 同一阈值，两种闸门结果</h2>
        <p>{H2.questionCount} 题，每题 {H2.k} 次，共 {H2.rowCount} 行。阈值为 {percentage(H2.threshold)}。</p>
        <dl className="metrics">
          <div><dt>行级均值</dt><dd>{percentage(H2.mean)}</dd><span>{H2.rowGate ? '通过' : '未通过'}</span></div>
          <div><dt>pass@{H2.k} · 至少一次正确</dt><dd>{percentage(H2.passAtK)}</dd></div>
          <div><dt>pass^{H2.k} · 每次都正确</dt><dd>{percentage(H2.passPowerK)}</dd><span>{H2.stabilityGate ? '通过' : '未通过'}</span></div>
        </dl>
      </section>

      <section>
        <h2>H1 · LangSmith 按轮展开</h2>
        <ul>{H1.map(({ examples, numRepetitions, rowCount }) => (
          <li key={examples}>{examples} 条 × {numRepetitions} 轮 = {rowCount} 行，每个原 ID 出现 {numRepetitions} 次。</li>
        ))}</ul>
      </section>

      <section>
        <h2>H3 · Braintrust 按题展开</h2>
        <p>共 {H3.rowCount} 行，各题的 trialIndex 如下。</p>
        <ul>{H3.cases.map(({ id, trialIndices }) => <li key={id}>{id} · [{trialIndices.join(', ')}]</li>)}</ul>
      </section>

      <section>
        <h2>H4 · Summary 聚合</h2>
        <p>直接计数得 {percentage(H4.naiveSummary)}。按题分组后，pass@{H2.k} 为 {percentage(H4.passAtK)}，pass^{H2.k} 为 {percentage(H4.passPowerK)}。</p>
      </section>

      <section>
        <h2>H5 · Braintrust 默认 reporter</h2>
        <p>全为零分且无错误时，reportEval 返回 <code>{String(H5.lowScores)}</code>。含错误时返回 <code>{String(H5.withError)}</code>。</p>
        <p>reportRun 在所有评测成功时返回 <code>{String(H5.allSuccessfulRun)}</code>，有一项失败时返回 <code>{String(H5.mixedRun)}</code>。</p>
      </section>
    </main>
  );
}
