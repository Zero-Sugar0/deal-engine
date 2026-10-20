import {
  modelId,
  printSection,
  runHumanized,
  runRaw,
  taskFromArgs,
} from './lib/experiment.js';

const task = taskFromArgs();
const raw = await runRaw(task);
const humanized = await runHumanized(task);

printSection('comparison', {
  task,
  model: modelId(),
  sameModelAndTask: true,
  raw: {
    usage: raw.usage,
    finishReason: raw.finishReason,
  },
  humanized: {
    context: humanized.context,
    usage: humanized.usage,
    finishReason: humanized.finishReason,
  },
});
printSection('raw response', raw.text);
printSection('humanized response', humanized.text);
