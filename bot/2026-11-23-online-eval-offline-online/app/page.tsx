import { evaluate, pipelines } from "../lib/evaluation";
import { frozenQuestions, rows } from "../lib/frozen";

const label = (pass: boolean) => pass ? "通过" : "失败";

export default function Page() {
  const { scored, h2 } = evaluate(rows);
  const questions = new Map(frozenQuestions.map(({ id, question }) => [id, question]));
  return (
    <main>
      <h1>冻结轨迹评测</h1>
      <p>Agentic 首步 search 执行成功 {h2.localPass}/{h2.n}，同一批轨迹端到端精确匹配 {h2.goldPass}/{h2.n}。</p>
      {pipelines.map((pipeline) => (
        <section key={pipeline}>
          <h2>{pipeline}</h2>
          <div className="table-scroll">
            <table>
              <thead><tr><th>题面</th><th>轮次</th><th>当时输出</th><th>SKU 格式</th><th>无显式工具错误</th><th>离线金标</th><th>精确匹配</th></tr></thead>
              <tbody>
                {scored.filter(({ row }) => row.pipeline === pipeline).map(({ row, skuSet, noToolError }) => (
                  <tr key={`${row.qid}-${row.run}`}>
                    <td>{questions.get(row.qid)}</td>
                    <td>{row.run}</td>
                    <td>{JSON.stringify(row.answer)}</td>
                    <td>{label(skuSet)}</td>
                    <td>{label(noToolError)}</td>
                    <td>{JSON.stringify(row.gold)}</td>
                    <td>{label(row.correct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </main>
  );
}
