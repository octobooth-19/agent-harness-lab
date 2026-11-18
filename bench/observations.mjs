import path from 'node:path';
import { ensure } from './schema.mjs';

function observeConfiguration(events, workspace, components) {
  const invocations = events.filter(event => event.type === 'skill.invoked');
  return components.flatMap(component => Object.entries(component.files).flatMap(([file, text]) => {
    const entry = { component: component.id, version: component.version, path: file };
    if (file === '.github/copilot-instructions.md') {
      return [{ ...entry, kind: 'instructions', status: 'not-verifiable-from-trace' }];
    }
    if (!/^\.github\/skills\/[^/]+\/SKILL\.md$/.test(file)) return [];
    const expected = path.resolve(workspace, file);
    const matches = invocations.filter(({ data }) =>
      typeof data?.path === 'string' && path.isAbsolute(data.path) && path.normalize(data.path) === expected);
    const contents = matches.flatMap(({ data }) => typeof data.content === 'string' ? [data.content] : []);
    // The event can carry the injected body without the definition's YAML frontmatter.
    const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
    return [{ ...entry, kind: 'skill', status: matches.length ? 'invocation-observed' : 'invocation-not-observed',
      matchingEvents: matches.length,
      pinnedBodyMatched: contents.length ? contents.some(content => content === text || content.trim() === body) : null }];
  }));
}

export function inspectAppEvents(events, { sessionId, workspace, prompt, components = [] }) {
  const starts = events.filter(event => event.type === 'session.start');
  ensure(starts.length === 1 && starts[0].data?.sessionId === sessionId,
    'events must identify one fresh session matching the coordinator receipt');
  const start = starts[0];
  ensure(path.resolve(start.data.context?.cwd ?? '') === path.resolve(workspace),
    'observed app working directory differs from the frozen trial workspace');
  const messages = events.filter(event => event.type === 'user.message');
  ensure(messages.length === 1 && messages[0].data?.content === prompt,
    'app trace must contain only the unchanged generated kickoff; extra or changed user messages contaminate this trial');
  const configurationEvidence = observeConfiguration(events.slice(events.indexOf(messages[0]) + 1), workspace, components);
  const completion = events.filter(event => ['assistant.turn_end', 'assistant.idle'].includes(event.type)).at(-1);
  const startTime = Date.parse(start.timestamp);
  const endTime = Date.parse(completion?.timestamp);
  const wallMs = Number.isFinite(startTime) && Number.isFinite(endTime) && endTime >= startTime ? endTime - startTime : null;
  const modelNames = new Set(events.flatMap(event => {
    const model = event.type === 'session.auto_mode_resolved' ? event.data?.chosenModel :
      event.type === 'model.call_start' ? event.data?.model : null;
    return typeof model === 'string' && model !== 'auto' ? [model] : [];
  }));
  const usage = events.filter(event => event.type === 'session.usage_checkpoint').at(-1)?.data?.providerModelMetrics;
  const validUsage = Array.isArray(usage) && usage.length > 0 && usage.every(item =>
    Number.isFinite(item.metrics?.usage?.inputTokens) && item.metrics.usage.inputTokens >= 0 &&
    Number.isFinite(item.metrics?.usage?.outputTokens) && item.metrics.usage.outputTokens >= 0);
  const inputTokens = validUsage ? usage.reduce((sum, item) => sum + item.metrics.usage.inputTokens, 0) : null;
  const outputTokens = validUsage ? usage.reduce((sum, item) => sum + item.metrics.usage.outputTokens, 0) : null;
  return {
    sessionId, actualCwd: start.data.context.cwd, runtimeVersion: start.data.copilotVersion ?? 'unknown',
    selectedModel: start.data.selectedModel ?? 'unknown',
    actualModel: modelNames.size === 1 ? [...modelNames][0] : modelNames.size ? `mixed:${[...modelNames].sort().join(',')}` : 'unknown',
    observedModels: [...modelNames].sort(), kickoffVerified: true, configurationEvidence,
    metrics: { wallMs, inputTokens, outputTokens, totalTokens: validUsage ? inputTokens + outputTokens : null,
      observedFrom: 'Session start to last observed turn-end/idle, excluding later shutdown; last session.usage_checkpoint providerModelMetrics[].metrics.usage. Input includes any provider-reported cached tokens. Total is input + output, not a billed-token estimate. Missing counters are null.' },
    completionEvidence: completion ? { type: completion.type, timestamp: completion.timestamp } : null,
    caveat: 'Observed turn completion and usage are not proof of task success. Coordinator must independently attest outcome, permissions, inherited configuration and timeout state.',
  };
}
