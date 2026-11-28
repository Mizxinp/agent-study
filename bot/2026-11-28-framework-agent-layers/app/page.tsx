import { ToolLoopAgent } from 'ai';
import { prompt, scriptedModel, tools } from '../lib/scripted-model';

export default async function Home() {
  const { model, calls } = scriptedModel();
  const agent = new ToolLoopAgent({ model, tools, onWarning: () => {} });
  const result = await agent.generate({ prompt });

  return (
    <main>
      <h1>AI SDK 智能体分层实验</h1>
      <dl>
        <dt>ToolLoopAgent</dt>
        <dd>在应用进程内运行模型与工具循环，实现 SDK 的 Agent 接口。</dd>
        <dt>WorkflowAgent</dt>
        <dd>为 Workflow DevKit 提供耐久工具循环，通过 writable 参数输出流。</dd>
        <dt>eve</dt>
        <dd>在 AI SDK 之上封装渠道、排程与审批。本实验覆盖前两层。</dd>
      </dl>
      <section aria-labelledby="result">
        <h2 id="result">ToolLoopAgent 离线运行结果</h2>
        <p>{result.steps.length} 步 · {result.stoppedBy}</p>
        <p><code>{calls[0]?.userAgent}</code></p>
      </section>
    </main>
  );
}
