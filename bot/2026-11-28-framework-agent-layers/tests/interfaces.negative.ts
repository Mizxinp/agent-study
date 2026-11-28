import { createAgentUIStreamResponse, ToolLoopAgent } from 'ai';
import { WorkflowAgent } from '@ai-sdk/workflow';
import { scriptedModel } from '../lib/scripted-model';

const { model } = scriptedModel();
const toolLoop = new ToolLoopAgent({ model, experimental_toolApprovalSecret: new Uint8Array(0) });
const workflow = new WorkflowAgent({
  model,
  experimental_toolApprovalSecret: { environmentVariable: 'DEMO_APPROVAL_FIXTURE' },
});

createAgentUIStreamResponse({ agent: toolLoop, uiMessages: [] });
createAgentUIStreamResponse({ agent: workflow, uiMessages: [] });
new WorkflowAgent({ model, experimental_toolApprovalSecret: 'local-fixture-only' });
