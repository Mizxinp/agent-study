const observations = [
  ['H1', '历史分数与断言结果', '1 通过、1 失败，断言 5 通过、1 失败。Relevance 原始分 6，组件分 1。', '0'],
  ['H2', '只有分数的记录', 'Quality = 0.5，行分 1，计入 1 次成功，断言数为 0。', '0'],
  ['H3', '跨 run 对齐与采样错误', '两列共享 testIdx 0。错误列有 1 次 ERROR，行分 0，另一列成功。', '0'],
  ['H4', '对齐键', '四行依次对应 testIdx 0、0、1、2，共 3 个测试。', '0'],
  ['H5', '导入配置', '原始行保留 testing_criteria，导出配置中生成的 assert 数为 0。', '0（复用 H2）'],
  ['H6', '模拟 API 列表', '落入 Promptfoo JSON 校验，因结果结构不受支持而被拒绝。', '1'],
];

export default function Page() {
  return (
    <main>
      <header>
        <p className="version">Promptfoo 0.126.0</p>
        <h1>OpenAI Evals 导入对照</h1>
        <p>四份冻结夹具的 CLI 导出与独立 TypeScript 重算在核对字段上全部一致。</p>
      </header>
      <dl>
        {observations.map(([id, title, result, exit]) => (
          <div className="observation" key={id}>
            <dt><span>{id}</span> {title}</dt>
            <dd>{result}<small>CLI import 退出码 {exit}</small></dd>
          </div>
        ))}
      </dl>
      <p className="note">另有一份非法行夹具。CLI 指出第 2 行格式不符，退出码为 1。</p>
    </main>
  );
}
