import summary from '../results/summary.json';

export default function Page() {
  return (
    <main>
      <h1>工具调用与结构化输出</h1>
      <p>主题 4.1 · 离线请求截获与 MockLanguageModelV4</p>
      <table>
        <thead><tr><th>假设</th><th>结论</th><th>截获请求</th><th>通过 / 断言</th></tr></thead>
        <tbody>
          {summary.results.map(result => (
            <tr key={result.id}>
              <th scope="row">{result.id}</th>
              <td>{result.verdict}</td>
              <td>{result.requestCount}</td>
              <td>{result.passed} / {result.assertions}</td>
            </tr>
          ))}
          <tr><th scope="row">H9</th><td>{summary.live.verdict}</td><td>0</td><td>—</td></tr>
        </tbody>
      </table>
      <p>{summary.live.reason}。</p>
      {summary.results.map(result => (
        <details key={result.id}>
          <summary>{result.id} 实测断言与请求</summary>
          <pre>{JSON.stringify({ checks: result.checks, requests: result.requests }, null, 2)}</pre>
        </details>
      ))}
      <details>
        <summary>夹具 SHA-256</summary>
        <pre>{JSON.stringify(summary.fixtureHashes, null, 2)}</pre>
      </details>
    </main>
  );
}
