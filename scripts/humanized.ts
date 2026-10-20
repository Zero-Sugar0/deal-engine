import {
  modelId,
  printSection,
  runHumanized,
  taskFromArgs,
} from './lib/experiment.js';

const task = taskFromArgs();
const result = await runHumanized(task);

printSection('humanized run', {
  task,
  model: modelId(),
  mode: 'humanized',
  context: result.context,
  usage: result.usage,
  finishReason: result.finishReason,
});
printSection('response', result.text);
