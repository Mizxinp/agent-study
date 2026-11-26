import summary from '../results/summary.json';

export default function Page() {
  return <main>
    <h1>MCP 无状态核心与 MRTR 实验结果</h1>
    <pre>{JSON.stringify(summary, null, 2)}</pre>
  </main>;
}
