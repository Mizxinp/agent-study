import { dashboard, fixture } from './fixtures';
import { recompute } from './recompute';

for (const name of dashboard) {
  console.log(JSON.stringify({ fixture: name, ...recompute(fixture(name)) }, null, 2));
}
