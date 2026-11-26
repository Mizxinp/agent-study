import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { afterAll, expect, test } from 'vitest';
import { createMCPClient, ElicitationRequestSchema, MCPClientError } from '@ai-sdk/mcp';
import { generateText, stepCountIs } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { client, connect, describeResponse, endpoint, pin, post, sse, toolData, version, wire } from './http';

const measured: Record<string, unknown> = {};
const sku = { sku: 'CUP-001' };
const accept = { action: 'accept' as const, content: { confirm: true } };
const aiClient = (advertiseSampling = false) => createMCPClient({
  transport: { type: 'http', url: endpoint(3100) },
  capabilities: { elicitation: { form: {} }, ...(advertiseSampling && { sampling: {} }) },
});

afterAll(() => writeFileSync('results/run.json', JSON.stringify(measured, null, 2) + '\n'));

test('H1 pinned modern calls round-robin without sessions', async () => {
  const before = wire().length;
  const sdk = client(pin);
  const ports: number[] = [];
  try {
    await connect(sdk);
    for (let count = 0; count < 10; count++) {
      const answer = await sdk.callTool({ name: 'get_sku', arguments: sku });
      expect(answer.isError).not.toBe(true);
      ports.push(toolData(answer).port);
    }
  } finally {
    await sdk.close();
  }
  const rows = wire().slice(before);
  const sessions = rows.filter(row => row.responseSession).length;
  const initializes = rows.filter(row => row.method === 'initialize').length;
  measured.H1 = { successes: ports.length, ports, sessions, initializes, wire: rows.slice(0, 3) };
  expect(ports).toEqual(Array.from({ length: 10 }, (_, index) => index % 2 ? 3101 : 3102));
  expect(rows.filter(row => row.method === 'tools/call').map(row => row.instance)).toEqual(ports);
  expect(rows[0].method).toBe('server/discover');
  expect(sessions).toBe(0);
  expect(initializes).toBe(0);
});

test('H2 invalid headers, versions, verbs, and no-id notification', async () => {
  const params = { name: 'get_sku', arguments: sku };
  const result = {
    method: await describeResponse(await post(3101, 'tools/call', params, { methodHeader: 'tools/list' })),
    name: await describeResponse(await post(3101, 'tools/call', params, { nameHeader: 'update_price' })),
    version: await describeResponse(await post(3101, 'tools/call', params, { version: '1900-01-01' })),
    get: await describeResponse(await fetch(endpoint(3101))),
    delete: await describeResponse(await fetch(endpoint(3101), { method: 'DELETE' })),
    notification: await describeResponse(await post(3101, 'notifications/initialized', {}, { notification: true })),
  };
  measured.H2 = result;
  for (const mismatch of [result.method, result.name]) {
    expect(mismatch).toMatchObject({ status: 400, body: { error: { code: -32020 } } });
  }
  expect(result.version).toMatchObject({ status: 400, body: { error: { code: -32022 } } });
  expect(result.version.body.error.data.supported).toContain(version);
  expect(result.get).toMatchObject({ status: 405, allow: 'POST' });
  expect(result.delete).toMatchObject({ status: 405, allow: 'POST' });
  expect(result.notification).toMatchObject({ status: 202, body: null });
});

test('H3 SDK defaults and strict legacy rejection', async () => {
  async function official(mode?: 'auto') {
    const mark = wire().length;
    const sdk = client(mode ? { versionNegotiation: { mode } } : undefined);
    try {
      await connect(sdk);
      const result = await sdk.callTool({ name: 'get_sku', arguments: sku });
      return { data: toolData(result), wire: wire().slice(mark) };
    } finally {
      await sdk.close();
    }
  }
  const legacy = await official();
  const auto = await official('auto');
  const mark = wire().length;
  const ai = await aiClient();
  await ai.close();
  const aiWire = wire().slice(mark);
  const rejectMark = wire().length;
  const sdk = client();
  let failure: { type: string; message: string; code?: string | number } | undefined;
  try {
    await connect(sdk, 3110);
  } catch (error) {
    const e = error as Error & { code?: string | number };
    failure = { type: e.constructor.name, message: e.message, code: e.code };
  } finally {
    await sdk.close();
  }
  const reject = wire().slice(rejectMark);
  const raw = await describeResponse(await fetch(endpoint(3111), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 200, method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'raw', version: '1' } },
    }),
  }));
  measured.H3 = { legacy, auto, aiWire, reject, failure, raw };
  expect(legacy.wire[0].method).toBe('initialize');
  expect(legacy.data.sku).toBe(sku.sku);
  expect(auto.wire[0].method).toBe('server/discover');
  expect(auto.wire.find(row => row.method === 'tools/call')).toMatchObject({
    hasMeta: true, protocol: version, nameHeader: 'get_sku', methodHeader: 'tools/call',
  });
  expect(aiWire[0].method).toBe('server/discover');
  expect(failure).toBeDefined();
  expect(reject[0]).toMatchObject({ method: 'initialize', status: 400 });
  expect(raw.body.error.code).toBe(-32022);
});

test('H4 follow-up, state integrity, key locality, and idempotency', async () => {
  const sdk = client({ versionNegotiation: { mode: 'auto' }, capabilities: { elicitation: { form: {} } } });
  sdk.setRequestHandler('elicitation/create', async () => accept);
  const mark = wire().length;
  let automatic;
  try {
    await connect(sdk);
    automatic = toolData(await sdk.callTool({ name: 'update_price', arguments: { sku: 'CUP-AUTO', newPrice: 90 } }));
  } finally {
    await sdk.close();
  }
  const rounds = wire().slice(mark).filter(row => row.method === 'tools/call');

  const first = async (port: number, sku: string, newPrice = 91) => {
    const args = { sku, newPrice };
    const response = await describeResponse(await post(port, 'tools/call', { name: 'update_price', arguments: args }));
    expect(response.body.result.resultType).toBe('input_required');
    const state: string = response.body.result.requestState;
    expect(typeof state).toBe('string');
    return { args, state };
  };
  type Flow = Awaited<ReturnType<typeof first>>;
  const retry = async (port: number, flow: Flow, user?: string) => {
    const result = await describeResponse(await post(port, 'tools/call', {
      name: 'update_price', arguments: flow.args,
      inputResponses: { confirm: accept }, requestState: flow.state,
    }, { user }));
    return result.body.error
      ? { status: result.status, error: result.body.error }
      : result.body.result?.isError
        ? { status: result.status, toolError: result.body.result.content[0].text }
        : { status: result.status, value: toolData(result.body.result) };
  };
  const hop = async (port: number) => describeResponse(await post(port, 'tools/call', {
    name: 'get_sku', arguments: sku,
  }));

  const signed = await first(3100, 'CUP-WIRE');
  const payload = JSON.parse(Buffer.from(signed.state.split('.')[1], 'base64url').toString()).p;
  const offset = signed.state.lastIndexOf('.') + 1;
  const changed = signed.state[offset] === 'A' ? 'B' : 'A';
  const tampered = await retry(3100, { ...signed, state: signed.state.slice(0, offset) + changed + signed.state.slice(offset + 1) });
  const principal = await retry(3100, signed, 'another-demo-user');
  const argumentsChanged = await retry(3100, { ...signed, args: { ...signed.args, newPrice: 92 } });
  const ttl = await first(3100, 'CUP-TTL');
  await setTimeout(2000);
  const expired = await retry(3100, ttl);

  const localMark = wire().length;
  const cross = await first(3110, 'CUP-LOCAL-CROSS');
  const differentInstance = await retry(3110, cross);
  const local = await first(3110, 'CUP-LOCAL-SAME');
  await hop(3110);
  const sameInstance = await retry(3110, local);
  const localWire = wire().slice(localMark).filter(row => row.nameHeader === 'update_price');

  const replayMark = wire().length;
  const replay = await first(3100, 'CUP-REPLAY');
  const firstApply = await retry(3100, replay);
  await hop(3100);
  const secondApply = await retry(3100, replay);
  const replayWire = wire().slice(replayMark).filter(row => row.nameHeader === 'update_price');

  measured.H4 = {
    automatic, rounds, decoded: { sku: payload.sku, newPrice: payload.newPrice }, tampered,
    principal, argumentsChanged, ttlSeconds: 1, waitMs: 2000, expired,
    differentInstance, sameInstance, localWire, firstApply, secondApply, replayWire,
  };
  expect(automatic.applied).toBe(true);
  expect(rounds).toHaveLength(2);
  expect(rounds[0].id).not.toBe(rounds[1].id);
  expect(rounds[0].instance).not.toBe(rounds[1].instance);
  expect(rounds[0]).toMatchObject({ hasResponses: false, hasState: false });
  expect(rounds[1]).toMatchObject({ hasResponses: true, hasState: true, instance: automatic.port });
  expect(payload).toMatchObject(signed.args);
  for (const rejected of [tampered, principal, expired, differentInstance]) {
    expect(rejected.error?.code).toBe(-32602);
  }
  expect(argumentsChanged).toMatchObject({ status: 200, toolError: 'Price arguments differ from signed state' });
  expect(localWire[0].instance).not.toBe(localWire[1].instance);
  expect(localWire[2].instance).toBe(localWire[3].instance);
  expect(sameInstance.value.applied).toBe(true);
  expect(firstApply.value).toMatchObject({ applied: true, duplicate: false });
  expect(secondApply.value).toMatchObject({ applied: false, duplicate: true, port: firstApply.value.port });
});

test('H5 AI SDK form elicitation, sampling rejection, and mock generation', async () => {
  const sdk = await aiClient();
  let elicitationCount = 0;
  sdk.onElicitationRequest(ElicitationRequestSchema, async () => {
    elicitationCount++;
    return accept;
  });
  try {
    const priceResult = await sdk.callTool({ name: 'update_price', arguments: { sku: 'CUP-AI', newPrice: 93 } });
    if (!('content' in priceResult) || !Array.isArray(priceResult.content)) throw new Error('Expected tool content');
    const price = toolData({ content: priceResult.content });
    const samplingMark = wire().length;
    const unadvertised = await sdk.callTool({ name: 'ask_model' }).then(() => undefined, error => error);
    const samplingClient = await aiClient(true);
    let sampling;
    try {
      sampling = await samplingClient.callTool({ name: 'ask_model' }).then(() => undefined, error => error);
    } finally {
      await samplingClient.close();
    }
    const samplingWire = wire().slice(samplingMark).filter(row => row.nameHeader === 'ask_model');
    const usage = {
      inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 5, text: 5, reasoning: undefined },
    };
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [{ type: 'tool-call', toolCallId: 'mock-call', toolName: 'get_sku', input: JSON.stringify(sku) }],
          finishReason: { unified: 'tool-calls', raw: undefined }, usage, warnings: [],
        },
        {
          content: [{ type: 'text', text: '已查询德化白瓷杯。' }],
          finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [],
        },
      ],
    });
    const tools = await sdk.tools();
    const result = await generateText({
      model, tools, prompt: '查询 CUP-001', stopWhen: stepCountIs(2),
    });
    const output = result.steps[0].toolResults[0]?.output;
    const nextPrompt = model.doGenerateCalls[1].prompt;
    const nextTool = nextPrompt.flatMap(message => message.role === 'tool' ? message.content : [])
      .find(part => part.type === 'tool-result' && part.toolCallId === 'mock-call');
    measured.H5 = {
      price, elicitationCount, withoutSamplingCapability: { type: unadvertised?.name, message: unadvertised?.message },
      sampling: { type: sampling?.name, message: sampling?.message }, samplingWire,
      steps: result.steps.length, output, nextTool, text: result.text,
    };
    expect(price.applied).toBe(true);
    expect(elicitationCount).toBe(1);
    expect(unadvertised.message).toContain('do not declare the required capability');
    expect(MCPClientError.isInstance(sampling)).toBe(true);
    expect(sampling.message).toContain('Unsupported input request');
    expect(result.steps).toHaveLength(2);
    expect(JSON.stringify(output)).toContain(sku.sku);
    expect(JSON.stringify(nextTool)).toContain(sku.sku);
    expect(result.text).toBe('已查询德化白瓷杯。');
  } finally {
    await sdk.close();
  }
});

test('H6 intra-process event delivery only', async () => {
  const abort = new AbortController();
  const response = await post(3101, 'subscriptions/listen', {
    notifications: { toolsListChanged: true },
  }, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(6000)]) });
  const stream = sse(response);
  const touch = async (port: number) => describeResponse(await post(port, 'tools/call', { name: 'touch_catalog' }));
  try {
    const ack = (await stream.next()).value;
    const localCall = await touch(3101);
    const localEvent = (await stream.next()).value;
    const remoteCall = await touch(3102);
    const pending = stream.next().catch(error => {
      if (!abort.signal.aborted) throw error;
      return null;
    });
    const remoteEvent = await Promise.race([pending, setTimeout(2000, null)]);
    abort.abort();
    await pending;
    measured.H6 = { status: response.status, ack, localEvent, localCall, remoteCall, remoteEvent, waitMs: 2000 };
    expect(response.status).toBe(200);
    expect(ack.method).toBe('notifications/subscriptions/acknowledged');
    expect(localEvent.method).toBe('notifications/tools/list_changed');
    const key = 'io.modelcontextprotocol/subscriptionId';
    expect(localEvent.params._meta[key]).toBe(ack.params._meta[key]);
    expect(localEvent.params._meta[key]).toBeDefined();
    expect(toolData(localCall.body.result).port).toBe(3101);
    expect(toolData(remoteCall.body.result).port).toBe(3102);
    expect(remoteEvent).toBeNull();
  } finally {
    abort.abort();
    await stream.return(undefined);
  }
});

test('H7 cancel after five progress notifications by closing HTTP stream', async () => {
  const mark = wire().length;
  const sdk = client(pin);
  const abort = new AbortController();
  const progress: number[] = [];
  let abortedAt = 0;
  let afterAbort = 0;
  let failure;
  try {
    await connect(sdk);
    await sdk.callTool({ name: 'slow_export' }, {
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(5000)]),
      onprogress: update => {
        if (abortedAt) afterAbort++;
        progress.push(update.progress);
        if (progress.length === 5) {
          abortedAt = Date.now();
          abort.abort();
        }
      },
    });
  } catch (error) {
    const e = error as Error;
    failure = { type: e.constructor.name, message: e.message };
  } finally {
    await sdk.close();
  }
  // Wait longer than the uncancelled tool's remaining workload, to distinguish
  // no client messages from a backend that carried on and finished anyway.
  await setTimeout(2800);
  const rows = wire().slice(mark);
  const call = rows.find(row => row.nameHeader === 'slow_export')!;
  let observed;
  try {
    observed = JSON.parse(readFileSync(`results/export-${call.instance}.json`, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const cancelledPosts = rows.filter(row => row.method === 'notifications/cancelled').length;
  measured.H7 = {
    progress, failure, afterAbort, cancelledPosts, abortedAt, server: observed ?? null,
    deltaMs: observed?.cancelled ? observed.at - abortedAt : null, wire: rows,
  };
  expect(call.status).toBe(200);
  expect(progress).toEqual([1, 2, 3, 4, 5]);
  expect(failure).toBeDefined();
  expect(observed).toMatchObject({ cancelled: true, progress: 5 });
  expect(observed.at - abortedAt).toBeGreaterThanOrEqual(0);
  expect(afterAbort).toBe(0);
  expect(cancelledPosts).toBe(0);
});
