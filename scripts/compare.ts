import {
  modelId,
  runHumanized,
  runRaw,
  taskFromArgs,
} from './lib/experiment.js';
import { jsonMode, printComparison, withStatus } from './lib/terminal.js';

const task = taskFromArgs();
const raw = await withStatus('Generating raw response', () => runRaw(task));
const humanized = await withStatus(
  'Preparing DEAL context and generating response',
  () => runHumanized(task),
);

if (jsonMode()) {
  console.log(
    JSON.stringify(
      {
        task,
        model: modelId(),
        mode: 'comparison',
        sameModelAndTask: true,
        raw,
        humanized,
      },
      null,
      2,
    ),
  );
} else {
  printComparison(task, modelId(), raw, humanized);
}
