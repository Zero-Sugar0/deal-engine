import { modelId, runHumanized, taskFromArgs } from './lib/experiment.js';
import {
  jsonMode,
  printHeader,
  printResponse,
  withStatus,
} from './lib/terminal.js';

const task = taskFromArgs();
const result = await withStatus(
  'Preparing DEAL context and generating response',
  () => runHumanized(task),
);

if (jsonMode()) {
  console.log(
    JSON.stringify(
      {
        task,
        model: modelId(),
        mode: 'humanized',
        context: result.context,
        usage: result.usage,
        finishReason: result.finishReason,
        response: result.text,
      },
      null,
      2,
    ),
  );
} else {
  printHeader(task, modelId(), 'humanized');
  printResponse(
    'humanized response · DEAL context injected',
    result,
    result.context,
  );
}
