import { modelId, runRaw, taskFromArgs } from './lib/experiment.js';
import {
  jsonMode,
  printHeader,
  printResponse,
  withStatus,
} from './lib/terminal.js';

const task = taskFromArgs();
const result = await withStatus('Generating raw response', () => runRaw(task));

if (jsonMode()) {
  console.log(
    JSON.stringify({ task, model: modelId(), mode: 'raw', result }, null, 2),
  );
} else {
  printHeader(task, modelId(), 'raw');
  printResponse('raw response · no DEAL context', result);
}
