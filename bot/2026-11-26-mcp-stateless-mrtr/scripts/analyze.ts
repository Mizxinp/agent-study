import { readFileSync, writeFileSync } from 'node:fs';
import { wire, type WireRow } from '../tests/http';

const run = JSON.parse(readFileSync('results/run.json', 'utf8'));
const rows = wire();
const item = (supported: boolean, evidence: unknown) => ({
  conclusion: supported ? '支持' : '不支持', evidence,
});

const { H1, H2, H3, H4, H5, H6, H7 } = run;
const summary = {
  protocol: '2026-07-28',
  hypotheses: {
    H1: item(H1.successes === 10 && H1.sessions === 0 && H1.initializes === 0
      && H1.ports.every((port: number, index: number) => port === (index % 2 ? 3101 : 3102)), H1),
    H2: item(H2.method.status === 400 && H2.method.body.error.code === -32020
      && H2.name.status === 400 && H2.name.body.error.code === -32020
      && H2.version.status === 400 && H2.version.body.error.code === -32022
      && H2.version.body.error.data.supported.includes('2026-07-28')
      && [H2.get, H2.delete].every(entry => entry.status === 405 && entry.allow === 'POST')
      && H2.notification.status === 202 && H2.notification.body === null, H2),
    H3: item(H3.legacy.wire[0].method === 'initialize' && H3.legacy.data.sku === 'CUP-001'
      && H3.auto.wire[0].method === 'server/discover'
      && H3.auto.wire.some((row: WireRow) => row.hasMeta && row.methodHeader === 'tools/call' && row.protocol === '2026-07-28')
      && H3.aiWire[0].method === 'server/discover' && H3.reject[0].status === 400
      && H3.raw.body.error.code === -32022 && !!H3.failure, H3),
    H4: item(H4.automatic.applied && H4.rounds.length === 2
      && H4.rounds[0].id !== H4.rounds[1].id && H4.rounds[0].instance !== H4.rounds[1].instance
      && H4.rounds[1].hasResponses && H4.rounds[1].hasState
      && H4.decoded.sku === 'CUP-WIRE' && H4.decoded.newPrice === 91
      && [H4.tampered, H4.principal, H4.expired, H4.differentInstance]
        .every(entry => entry.error?.code === -32602)
      && H4.argumentsChanged.toolError === 'Price arguments differ from signed state'
      && H4.sameInstance.value?.applied && H4.firstApply.value?.applied
      && H4.secondApply.value?.duplicate && !H4.secondApply.value?.applied, H4),
    H5: item(H5.price.applied && H5.elicitationCount === 1
      && H5.sampling.type === 'MCPClientError' && H5.sampling.message.includes('Unsupported input request')
      && H5.steps === 2 && JSON.stringify(H5.nextTool).includes('CUP-001'), H5),
    H6: item(H6.localEvent.method === 'notifications/tools/list_changed'
      && H6.ack.params._meta['io.modelcontextprotocol/subscriptionId']
        === H6.localEvent.params._meta['io.modelcontextprotocol/subscriptionId']
      && H6.remoteEvent === null, H6),
    H7: item(H7.progress.length === 5 && H7.afterAbort === 0 && H7.cancelledPosts === 0
      && H7.server?.cancelled && H7.server.progress === 5 && H7.deltaMs >= 0, H7),
  },
};

writeFileSync('results/summary.json', JSON.stringify(summary, null, 2) + '\n');

const sample = [
  ...H1.wire,
  H3.legacy.wire[0], H3.auto.wire[0], H3.aiWire[0], H3.reject[0],
  ...H4.rounds, ...H4.localWire, ...H5.samplingWire, ...H7.wire,
];
writeFileSync('results/wire-log.sample.jsonl', sample.map(row => JSON.stringify(row)).join('\n') + '\n');

const metrics = [
  `${H1.successes} 次成功 / ${H1.sessions} 个响应会话头 / ${H1.initializes} 次 initialize`,
  `${H2.method.status}, ${H2.name.status}, ${H2.version.status}, ${H2.get.status}, ${H2.delete.status}, ${H2.notification.status}`,
  `${H3.legacy.wire[0].method} / ${H3.auto.wire[0].method} / ${H3.aiWire[0].method} / ${H3.reject[0].status}`,
  `${H4.rounds.map((row: { instance: number }) => row.instance).join(' → ')} / 异密钥 ${H4.differentInstance.error?.code}`,
  `${H5.steps} 步 / ${H5.sampling.type}`,
  `同实例 ${H6.localEvent.method} / 跨实例 ${H6.remoteEvent?.method ?? '无'}`,
  `中止至服务端观察 ${H7.deltaMs ?? '未观察到'} ms / 后续消息 ${H7.afterAbort} / 取消 POST ${H7.cancelledPosts}`,
];
console.table(Object.entries(summary.hypotheses).map(([hypothesis, value], index) => ({
  假设: hypothesis, 结论: value.conclusion, 实测: metrics[index],
})));
console.log(`已采集 ${rows.length} 条代理记录，样本保留 ${sample.length} 条。`);
