import { chat } from '../../../../lib/support';

export function POST(request: Request) {
  return chat(request, process.env.ORCHESTRATION_DEMO_DATA_DIR);
}
