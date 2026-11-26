import summary from '../results/summary.json';

export default function Page() {
  return <main><h1>MCP Tasks 与 Events 实验</h1><pre>{JSON.stringify(summary, null, 2)}</pre></main>;
}
