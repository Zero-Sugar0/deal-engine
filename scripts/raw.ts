import { modelId, runRaw, taskFromArgs } from './lib/experiment.js';

const task = taskFromArgs();
const result = await runRaw(task);

console.log(
  JSON.stringify({ task, model: modelId(), mode: 'raw', result }, null, 2),
);
