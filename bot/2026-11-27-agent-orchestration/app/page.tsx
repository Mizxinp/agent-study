import results from '../results/summary.json';

export default function Page() {
  return <main style={{ maxWidth: 1000, margin: '0 auto', padding: '3rem 1.25rem' }}>
    <h1>德化陶瓷店客服编排实验</h1>
    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', background: '#fffdf8' }}>
      <thead><tr><th scope="col">实验</th><th scope="col">结论</th><th scope="col">观测</th></tr></thead>
      <tbody>{results.map(({ id, conclusion, data }) =>
        <tr key={id} style={{ borderTop: '1px solid #ded9d0' }}>
          <th scope="row" style={{ padding: '.6rem' }}>{id}</th>
          <td style={{ whiteSpace: 'nowrap', padding: '.6rem' }}>{conclusion}</td>
          <td style={{ padding: '.6rem' }}><details><summary>实测数据</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(data, null, 2)}</pre></details></td>
        </tr>)}</tbody>
    </table>
  </main>;
}
