import { approve } from '../../../../lib/support';

export function POST(request: Request) {
  return approve(request, process.env.ORCHESTRATION_DEMO_DATA_DIR);
}
