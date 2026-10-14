const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAiProvider, AiProviderError } = require('../src/services/aiProvider');

const env = { AI_PROVIDER: 'groq', GROQ_API_KEY: 'test-key', GROQ_MODEL: 'test-model' };
const providerResponse = payload => ({ ok: true, json: async () => ({ output_text: JSON.stringify(payload) }) });

test('AI provider parses structured task suggestions without saving them', async () => {
  let requestBody, requestUrl;
  const provider = createAiProvider({ env, fetchImpl: async (url, options) => { requestUrl = url; requestBody = JSON.parse(options.body); return providerResponse({ tasks: [{ title: 'Review project brief', description: 'Confirm scope and constraints.', priority: 'High' }] }); } });
  const suggestions = await provider.suggestTasks({ project: { name: 'Launch', description: 'Prepare launch.' }, existingTitles: [] });
  assert.deepEqual(suggestions, [{ title: 'Review project brief', description: 'Confirm scope and constraints.', priority: 'High' }]);
  assert.equal(requestBody.model, 'test-model');
  assert.equal(requestUrl, 'https://api.groq.com/openai/v1/responses');
  assert.equal(requestBody.text.format.type, 'json_schema');
});

test('AI provider parses task breakdown and rejects malformed output', async () => {
  const provider = createAiProvider({ env, fetchImpl: async () => providerResponse({ subtasks: [{ title: 'Draft launch plan' }] }) });
  assert.deepEqual(await provider.breakDownTask({ task: { title: 'Plan launch', description: 'Coordinate work.' } }), [{ title: 'Draft launch plan' }]);
  const malformed = createAiProvider({ env, fetchImpl: async () => providerResponse({ subtasks: [{ title: 'x' }] }) });
  await assert.rejects(malformed.breakDownTask({ task: { title: 'Plan launch' } }), error => error instanceof AiProviderError && error.status === 502);
});

test('AI provider handles missing config, provider failures, and non-JSON output', async () => {
  const missing = createAiProvider({ env: { AI_PROVIDER: 'groq' }, fetchImpl: async () => { throw new Error('must not call'); } });
  await assert.rejects(missing.suggestTasks({ project: { name: 'P', description: 'D' }, existingTitles: [] }), error => error.status === 503);
  const unsupported = createAiProvider({ env: { AI_PROVIDER: 'other', GROQ_API_KEY: 'test-key', GROQ_MODEL: 'test-model' }, fetchImpl: async () => { throw new Error('must not call'); } });
  await assert.rejects(unsupported.suggestTasks({ project: { name: 'P', description: 'D' }, existingTitles: [] }), error => error.status === 503);
  const failed = createAiProvider({ env, fetchImpl: async () => ({ ok: false, json: async () => ({ error: 'private detail' }) }) });
  await assert.rejects(failed.suggestTasks({ project: { name: 'P', description: 'D' }, existingTitles: [] }), error => error.status === 502 && !error.message.includes('private detail'));
  const invalid = createAiProvider({ env, fetchImpl: async () => providerResponse({ unexpected: true }) });
  await assert.rejects(invalid.suggestTasks({ project: { name: 'P', description: 'D' }, existingTitles: [] }), error => error.status === 502);
});
