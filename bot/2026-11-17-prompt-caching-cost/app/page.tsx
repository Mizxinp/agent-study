import { EvalPanel } from "./eval-panel";
import {
  ANTHROPIC_PRICE_SOURCE,
  ANTHROPIC_PRICES,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_TARGET_PREFIX_TOKENS,
  OPENAI_PRICE_SOURCE,
  OPENAI_PRICES,
} from "../lib/prices";

export default function Page() {
  const sonnet = ANTHROPIC_PRICES[DEFAULT_ANTHROPIC_MODEL];
  const sol = OPENAI_PRICES[DEFAULT_OPENAI_MODEL];
  return (
    <main>
      <h1>Prompt caching 成本与断点实测</h1>
      <p className="lede">
        这不是聊天产品。页面只展示假设、官方单价和如何运行评测。没有密钥时也可以打开；H5
        由单元测试覆盖，H1–H4 需要真实 API usage，当前缺密钥时不会伪造数字。
      </p>

      <div className="row">
        <span className="pill">ai@7.0.173</span>
        <span className="pill">@ai-sdk/anthropic@4.0.105</span>
        <span className="pill">@ai-sdk/openai@4.0.118</span>
        <span className="pill">Next.js 16.4.6</span>
      </div>

      <h2>要验证的假设</h2>
      <div className="card">
        <ul>
          <li>
            <strong>H1</strong>：缓存断点打在稳定前缀末尾，连续两次调用只改当前问题。第一次应写入，第二次应命中。
          </li>
          <li>
            <strong>H2</strong>：同一套前缀，但只把缓存标记放在带时间戳的变化问题上。不应出现 H1 那样的命中。
          </li>
          <li>
            <strong>H3</strong>：用官方单价计算，H1 的「一写一读」输入成本应低于两次都按未缓存输入价计费（本 demo 的对照是算术对照）。
          </li>
          <li>
            <strong>H4</strong>（可选）：记录 TTFT。样本少则标不确定，不挑单次好看的结果。
          </li>
          <li>
            <strong>H5</strong>：不依赖密钥。用请求拦截证明 message 级{" "}
            <code>providerOptions.anthropic.cacheControl</code> 只出现在该消息最后一个 content
            part；part 级标记优先。
          </li>
        </ul>
      </div>

      <EvalPanel />

      <h2>官方单价（估算用，不是账单）</h2>
      <p>
        抓取日期 {ANTHROPIC_PRICE_SOURCE.fetchedAt}（Asia/Shanghai）。Anthropic 来源：
        <a href={ANTHROPIC_PRICE_SOURCE.url}>{ANTHROPIC_PRICE_SOURCE.url}</a>
        。OpenAI 来源：
        <a href={OPENAI_PRICE_SOURCE.url}>{OPENAI_PRICE_SOURCE.url}</a>
        。单位均为每百万 tokens 美元。默认模型 {DEFAULT_ANTHROPIC_MODEL} / {DEFAULT_OPENAI_MODEL}，稳定前缀目标约{" "}
        {DEFAULT_TARGET_PREFIX_TOKENS} tokens。
      </p>
      <table>
        <thead>
          <tr>
            <th>模型</th>
            <th>未缓存输入</th>
            <th>缓存写入</th>
            <th>缓存命中</th>
            <th>输出</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{DEFAULT_ANTHROPIC_MODEL}</td>
            <td>${sonnet.input}</td>
            <td>5m ${sonnet.cacheWrite5m} / 1h ${sonnet.cacheWrite1h}</td>
            <td>${sonnet.cacheRead}</td>
            <td>${sonnet.output}</td>
          </tr>
          <tr>
            <td>{DEFAULT_OPENAI_MODEL}</td>
            <td>${sol.input}</td>
            <td>30m ${sol.cacheWrite30m} / 12h ${sol.cacheWrite12h}</td>
            <td>${sol.cachedInput}</td>
            <td>${sol.output}</td>
          </tr>
        </tbody>
      </table>

      <h2>怎么跑</h2>
      <pre>{`pnpm install
pnpm test        # 必须通过，含 H5
pnpm typecheck
pnpm build
pnpm dev         # 打开本页
pnpm eval        # 有密钥时跑 H1–H4，写出 results.json / results.md`}</pre>
      <p>
        详细说明、H1–H5 结论和可复现步骤见目录内 <code>REPORT.md</code>。
      </p>
    </main>
  );
}
