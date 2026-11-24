import { analyze } from '../lib/analysis';
import { loadFrozenData } from '../lib/dataset';

export default function Page() {
  const { fixtures } = loadFrozenData();
  const { rows } = analyze(fixtures);
  return (
    <main>
      <h1>德化陶瓷商品标题评测</h1>
      <p>{rows.length} 条冻结用例 · 生成与风格 judge 已跳过</p>
      <table>
        <thead>
          <tr>
            <th>用例</th><th>分组</th><th>标题与输入</th><th>忠实</th><th>覆盖</th>
            <th>长度</th><th>绝对化标记</th><th>合规金标应失败</th><th>硬闸门</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ id, split, title, attributes, required, maxChars, result }) => (
            <tr key={id}>
              <td>{id}</td><td>{split}</td>
              <td><details><summary>{title}</summary>
                <pre>{JSON.stringify({ attributes, required }, null, 2)}</pre>
              </details></td>
              <td>{result.faithfulness ? '通过' : result.unsupported.join('、')}</td>
              <td>{result.coverage ? '通过' : result.missing.join('、')}</td>
              <td>{result.chars}/{maxChars}</td>
              <td>{result.flag_absolute_terms ? '有' : '无'}</td>
              <td>{result.compliance_should_fail ? '是' : '否'}</td>
              <td>{result.pass ? '通过' : '失败'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
