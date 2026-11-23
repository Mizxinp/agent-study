import frozen from "../data/results.json";
import {
  four, pipelines, questionsFromRows, runs, slices, summarize, trialMetrics,
  type Row,
} from "../lib/statistics";

export default function Page() {
  const questions = questionsFromRows(frozen.rows as Row[]);

  return (
    <main>
      <header>
        <h1>评测体系设计</h1>
        <p>2.3 Agentic RAG 冻结结果 · {questions.length} 题 · 每条流水线每题 3 轮</p>
      </header>
      <section aria-labelledby="summary">
        <h2 id="summary">切片汇总</h2>
        <p>单次指精确匹配率，pass@3 指至少一轮正确，pass^3 指三轮全对。</p>
        <div className="table-scroll">
          <table aria-labelledby="summary">
            <thead><tr>{["切片", "流水线", "题数", "单次", "pass@3", "pass^3"].map(label =>
              <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>
              {slices.flatMap(slice => {
                const group = questions.filter(question => slice === "all" || question.type === slice);
                return pipelines.map(pipeline => {
                  const metrics = summarize(group, pipeline);
                  return <tr key={`${slice}/${pipeline}`}>
                    <th scope="row">{slice}</th><td>{pipeline}</td><td>{group.length}</td>
                    <td>{four(metrics.accuracy)}</td><td>{four(metrics.passAt3)}</td>
                    <td>{four(metrics.passAll3)}</td>
                  </tr>;
                });
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="questions">
        <h2 id="questions">逐题结果</h2>
        <div className="table-scroll">
          <table aria-labelledby="questions">
            <thead><tr>{["题号", "题型", "流水线", ...runs.map(run => `第 ${run} 轮`), "题级准确率", "pass@3", "pass^3"].map(label =>
              <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>
              {questions.flatMap(({ qid, type, trials }) => pipelines.map(pipeline => {
                const metrics = trialMetrics(trials[pipeline]);
                return <tr key={`${qid}/${pipeline}`}>
                  <th scope="row">{qid}</th><td>{type}</td><td>{pipeline}</td>
                  {runs.map((run, index) => <td key={run} data-correct={trials[pipeline][index]}>
                    {trials[pipeline][index] ? "正确" : "错误"}
                  </td>)}
                  <td>{four(metrics.accuracy)}</td>
                  <td>{metrics.passAt3 ? "是" : "否"}</td>
                  <td>{metrics.passAll3 ? "是" : "否"}</td>
                </tr>;
              }))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
