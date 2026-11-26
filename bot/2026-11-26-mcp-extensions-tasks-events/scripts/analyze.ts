import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { TASKS, VERSION } from '../lib/protocol';

// The recorded JSON is the observed protocol rather than the expected result schema.
const run = JSON.parse(readFileSync('results/run.json', 'utf8'));
const wire = [3201, 3202].flatMap(port =>
  readFileSync('results/wire-' + port + '.jsonl', 'utf8').trim().split('\n').map(line => JSON.parse(line)),
).sort((left, right) => left.at - right.at);

const rows: { id: string; conclusion: string; metrics: object }[] = [];
function add(id: string, conditions: (boolean | undefined)[], metrics: object) {
  const matched = conditions.filter(value => value === true).length;
  const conclusion = conditions.some(value => value === undefined) ? '不确定' :
    matched === conditions.length ? '支持' : matched === 0 ? '不支持' : '部分支持';
  rows.push({ id, conclusion, metrics });
}

type Reply = { port: number; status: number; body: { result?: Record<string, any>; error?: Record<string, any> } };
type Lifecycle = { elapsedMs: number; reads: Reply[] };
const summary = (reply?: Reply) => ({
  port: reply?.port, http: reply?.status, resultType: reply?.body.result?.resultType, rpcError: reply?.body.error?.code,
});
const check = (reply: Reply, resultType: string) => reply?.status === 200 && reply?.body.result?.resultType === resultType;
const code = (reply: Reply, expected: number, status = 200) => reply?.status === status && reply?.body.error?.code === expected;
const end = (lifecycle: Lifecycle) => lifecycle.reads.at(-1)?.body.result;
const life = (lifecycle: Lifecycle) => ({
  polls: lifecycle.reads.length, elapsedMs: lifecycle.elapsedMs, status: end(lifecycle)?.status,
  result: end(lifecycle)?.result, error: end(lifecycle)?.error,
});
const hasTasks = (reply: Reply) => Object.hasOwn(reply.body.error?.data?.requiredCapabilities?.extensions ?? {}, TASKS);
const isoTimestamp = z.iso.datetime({ offset: true });
const timestamps = (task?: Record<string, unknown>) =>
  [task?.createdAt, task?.lastUpdatedAt].every(value => isoTimestamp.safeParse(value).success);
const missingCaps = run['H0-capabilities'];
add('H0-capabilities', [code(missingCaps, -32602, 400)], summary(missingCaps));
const unsupportedVersion = run['H0-version'];
const versionData = unsupportedVersion.body.error?.data;
add('H0-version', [code(unsupportedVersion, -32022, 400), versionData?.requested === '1900-01-01',
  Array.isArray(versionData?.supported) && versionData.supported.length === 1 && versionData.supported[0] === VERSION],
{ ...summary(unsupportedVersion), data: versionData });

const [sync, rejected] = run.H1a as Reply[];
add('H1a', [check(sync, 'complete'), code(rejected, -32021, 400), hasTasks(rejected), !rejected.body.result],
  { sync: sync.body.result, syncResponse: summary(sync), rejected: summary(rejected), requiredCapabilities: rejected.body.error?.data?.requiredCapabilities });
const handle = run.H1b.body.result;
add('H1b', [check(run.H1b, 'task'), typeof handle?.taskId === 'string', handle?.status === 'working',
  handle?.ttlMs === 60000, handle?.pollIntervalMs === 200, timestamps(handle)], { ...summary(run.H1b), handle });
const [declared, omitted] = run.H1c;
add('H1c', [check(declared, 'task'), code(omitted, -32021, 400), hasTasks(omitted)], { declared: summary(declared), omitted: summary(omitted) });

for (const method of ['get', 'update', 'cancel']) {
  const id = 'H1d-' + method;
  const reply: Reply = run[id];
  add(id, [code(reply, -32021, 400), hasTasks(reply), !reply.body.result], {
    method: 'tasks/' + method, ...summary(reply), requiredCapabilities: reply.body.error?.data?.requiredCapabilities,
  });
}

const lifecycle: Lifecycle = run.H2a;
const first = lifecycle.reads[0];
add('H2a', [first?.port === 3202 && check(first, 'complete') && first.body.result?.taskId === handle?.taskId,
  lifecycle.reads.every(reply => timestamps(reply.body.result) && reply.body.result?.createdAt === handle?.createdAt),
  lifecycle.reads.every((reply, index) => reply.port === (index % 2 === 0 ? 3202 : 3201)),
  end(lifecycle)?.status === 'completed' && end(lifecycle)?.result?.isError === false],
{ first: { ...summary(first), createdAt: first?.body.result?.createdAt, lastUpdatedAt: first?.body.result?.lastUpdatedAt }, ports: lifecycle.reads.map(reply => reply.port), ...life(lifecycle) });
add('H2b', (run.H2b as Reply[]).map(reply => code(reply, -32020, 400)), { replies: run.H2b.map(summary) });
const { tool, internal } = run.H2c;
add('H2c', [end(tool)?.status === 'completed' && end(tool)?.result?.isError === true,
  end(internal)?.status === 'failed' && typeof end(internal)?.error?.code === 'number'],
{ tool: life(tool), internal: life(internal) });
const { early, late } = run.H2d;
const emptyAck = (reply: Reply) => check(reply, 'complete') && Object.keys(reply.body.result ?? {}).length === 1;
add('H2d', [emptyAck(early.ack), end(early.lifecycle)?.status === 'cancelled', end(late.before)?.status === 'completed', emptyAck(late.ack), end(late.lifecycle)?.status === 'completed'],
  { earlyAck: early.ack.body.result, early: life(early.lifecycle), lateBeforeAck: end(late.before)?.status, lateAck: late.ack.body.result, late: life(late.lifecycle) });
add('H2e', [code(run.H2e[0], -32602), code(run.H2e[1], -32601)], { replies: run.H2e.map(summary) });
add('H2f', [check(run.H2f.created, 'task'), check(run.H2f.owner, 'complete'), code(run.H2f.other, -32602)],
  { owner: summary(run.H2f.owner), other: summary(run.H2f.other) });

const rpc = wire.filter(row => row.kind === 'rpc');
const sdkCalls = rpc.filter(row => row.method === 'tools/call' && row.name === 'export_assets' && typeof row.id === 'number');
const noTasks = sdkCalls.find(row => !row.extensions.includes(TASKS) && row.errorCode === -32021 && row.status === 400);
const sdkTask = sdkCalls.find(row => row.extensions.includes(TASKS) && row.resultType === 'task');
const err = (value: any, fragment: string) =>
  value?.error?.name === 'MCPClientError' && value.error.message.includes(fragment);
add('H3a', [Boolean(noTasks), run.H3a.error?.className === 'MCPClientError',
  run.H3a.error?.message === 'Tasks capability required', run.H3a.error?.code === -32021, run.H3a.error?.statusCode === 400], { wire: noTasks, ...run.H3a });
add('H3b', [Boolean(sdkTask), run.H3b.error?.name === 'MCPClientError', run.H3b.error?.message === 'Failed to process server response'], { wire: sdkTask, ...run.H3b });
const agentOutput = (agent: any) => {
  const result = agent?.toolResults?.[0]?.output;
  try { return JSON.parse(result?.content?.[0]?.text ?? 'null'); }
  catch { return null; }
};
add('H3c', [run.H3c.steps === 2, agentOutput(run.H3c)?.exported === 3, Boolean(run.H3c.text)], run.H3c);

const modes = ['none', 'legacy', 'extensions'].map(mode => {
  const count = rpc.filter(row => row.eventsCap === mode && row.method === 'events/list').length;
  const observation = run['H4a-' + mode];
  return { mode, count, events: observation.value?.events?.length, error: observation.error };
});
add('H4a', [modes[0].count === 0 && err(run['H4a-none'], 'Server does not support events'),
  ...modes.slice(1).map(mode => mode.count > 0 && mode.events === 2)], { modes });
add('H4b', [err(run.H4b.stock, 'does not support webhook delivery'), err(run.H4b.mode, 'Only webhook event delivery is supported'),
  err(run.H4b.hostname, 'must use HTTPS')], run.H4b);

const c = run.H4c;
const initialSubscribe = rpc.find(row => row.method === 'events/subscribe' && row.resultType === 'complete');
const deliveryRows = wire.filter(row => row.kind === 'delivery');
const deliveries = deliveryRows.filter(row => !row.verification);
const validWebhookId = (id: unknown, eventId: unknown) =>
  typeof id === 'string' && typeof eventId === 'string' && /^[A-Za-z0-9_-]+$/.test(id) && !id.includes(eventId);
const verificationFor = (subscriptionId: string) => wire.find(row =>
  row.kind === 'verification' && row.matched && row.subscriptionId === subscriptionId);
const validVerification = (row: any, eventId: unknown) =>
  validWebhookId(row?.messageId, eventId) && /^msg_verification_[A-Za-z0-9_-]+$/.test(row.messageId) &&
  deliveryRows.some(delivery => delivery.verification && delivery.messageId === row.messageId && delivery.subscriptionId === row.subscriptionId);
const verification = verificationFor(c.subscription.id);
const pending = wire.find(row => row.kind === 'subscription-store' && row.status === 'pending');
const active = wire.find(row => row.kind === 'subscription-store' && row.status === 'active');
const data = c.order.event.data;
const normalCalls = wire.filter(row => row.kind === 'onEvent' && row.subscriptionId === c.subscription.id);
const ordered = [pending, verification, initialSubscribe, active].every(Boolean) &&
  wire.indexOf(pending) < wire.indexOf(verification) && wire.indexOf(verification) < wire.indexOf(initialSubscribe) &&
  wire.indexOf(initialSubscribe) < wire.indexOf(active);
const normalDelivery = deliveries.find(row => row.subscriptionId === c.subscription.id &&
  row.eventId === c.order.event.eventId && !row.variant);
add('H4c', [validVerification(verification, c.order.event.eventId),
  validWebhookId(normalDelivery?.messageId, c.order.event.eventId) &&
  normalDelivery?.messageId === c.order.deliveries[0]?.webhookId, ordered && verification.matched, c.active.status === 'active', c.onEvent === 1,
  c.order.deliveries[0]?.statuses?.[0] === 204, c.active.cursor !== c.subscription.cursor,
  data.shopId === 'dehua-01' && data.amount === 128 && typeof data.orderId === 'string' &&
  JSON.stringify(normalCalls[0]?.event?.data) === JSON.stringify(data)],
{ verification: verification?.matched, verificationId: verification?.messageId, webhookId: normalDelivery?.messageId, order: ordered, store: [pending?.status, c.active.status],
  cursor: [c.subscription.cursor, c.active.cursor], statuses: c.order.deliveries[0]?.statuses, onEvent: c.onEvent, data });
add('H4d', [...run.H4d.statuses.map((status: number) => status === 401), run.H4d.onEvent === 0], run.H4d);

const race = deliveries.filter(row => row.subscriptionId === run.H4e.id);
const raceVerification = verificationFor(run.H4e.id);
const raceCalls = wire.filter(row => row.kind === 'onEvent' && row.subscriptionId === run.H4e.id).length;
const raceStatuses = race.map(row => row.status);
add('H4e', [validVerification(raceVerification, race[0]?.eventId),
  race.length > 0 && race.every(row => validWebhookId(row.messageId, row.eventId)),
  race[0]?.messageId !== normalDelivery?.messageId, raceStatuses.join(',') === '503,204' && race[0]?.messageId === race[1]?.messageId,
  raceCalls === 1, run.H4e.initial !== run.H4e.final],
{ statuses: raceStatuses, webhookId: race[0]?.messageId, verificationId: raceVerification?.messageId, onEvent: raceCalls, retryMs: race[1] && race[1].at - race[0].at, cursor: [run.H4e.initial, run.H4e.final] });

const replay = deliveries.filter(row => row.subscriptionId === run.H4f.id && row.eventId === run.H4f.eventId &&
  (!row.variant || row.variant === 'replay'));
const work = wire.filter(row => row.kind === 'business' && row.subscriptionId === run.H4f.id && row.eventId === run.H4f.eventId);
const attempts = replay.map(row => row.status);
add('H4f', [validVerification(verification, run.H4f.eventId),
  validWebhookId(run.H4f.webhookId, run.H4f.eventId),
  replay.map(row => row.variant ?? 'original').join(',') === 'original,replay' &&
  replay.every(row => row.messageId === run.H4f.webhookId), attempts.join(',') === '204,204', normalCalls.length === 2, work.length === 1],
  { statuses: attempts, onEvent: normalCalls.length, business: work.length, webhookId: replay[0]?.messageId });
const agent = work[0]?.agent;
add('H4g', [Object.keys(data).sort().join(',') === 'amount,orderId,shopId', agent?.steps === 2,
  agentOutput(agent)?.orderId === data.orderId && agentOutput(agent)?.state === 'paid'],
{ payloadFields: Object.keys(data), agent });
add('H4h', [run.H4h.status === 410, run.H4h.onEvent === 0], run.H4h);

const unsupportedDelivery = run['H4i-unsupported'];
const unsupportedData = unsupportedDelivery.body.error?.data;
add('H4i-unsupported', [code(unsupportedDelivery, -32026), unsupportedData?.feature === 'deliveryMode',
  unsupportedData?.value === 'webhook'], { ...summary(unsupportedDelivery), data: unsupportedData });
const callbackFailure = run['H4i-callback'];
const callbackData = callbackFailure.body.error?.data;
add('H4i-callback', [code(callbackFailure, -32027), callbackData?.reason === 'challenge_failed'],
  { ...summary(callbackFailure), data: callbackData });

const sample = wire.filter(row =>
  ['verification', 'delivery', 'subscription-store'].includes(row.kind) ||
  (row.kind === 'rpc' && (row.errorCode || row.method === 'server/discover' || row.method === 'events/subscribe' ||
    (row.method === 'tools/call' && row.name === 'export_assets' && row.resultType === 'task'))) ||
  row === rpc.find(item => item.method === 'tasks/get' && item.port === '3202'),
).slice(0, 55);
const sampleText = sample.map(row => JSON.stringify(row)).join('\n') + '\n';
if (/whsec_[A-Za-z0-9+/]{20}/.test(sampleText)) throw new Error('Unexpected secret in wire sample');
writeFileSync('results/wire-log.sample.jsonl', sampleText);
writeFileSync('results/summary.json', JSON.stringify({ hypotheses: rows }, null, 2) + '\n');

const table = ['| 子项 | 结论 | 实测 |', '| --- | --- | --- |', ...rows.map(row =>
  '| ' + row.id + ' | ' + row.conclusion + ' | `' + JSON.stringify(row.metrics).replaceAll('|', '&#124;') + '` |',
)].join('\n');
const output = '<!-- analyze:start -->\n\n' + table + '\n\n<!-- analyze:end -->';
const report = readFileSync('REPORT.md', 'utf8');
const excerpt = [noTasks, sdkTask, verification, normalDelivery, ...race, ...replay.filter(row => row.variant === 'replay')].filter(Boolean).map(row => {
  const { port, kind, method, name, extensions, status, errorCode, resultType, matched, messageId } = row;
  return JSON.stringify({ port, kind, method, name, extensions, status, errorCode, resultType, matched, messageId });
}).join('\n');
const wireOutput = '<!-- wire:start -->\n\n```jsonl\n' + excerpt + '\n```\n\n<!-- wire:end -->';
writeFileSync('REPORT.md', report
  .replace(/<!-- analyze:start -->[\s\S]*?<!-- analyze:end -->/, () => output)
  .replace(/<!-- wire:start -->[\s\S]*?<!-- wire:end -->/, () => wireOutput));
console.log(table);
