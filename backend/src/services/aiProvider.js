class AiProviderError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'AiProviderError';
    this.status = status;
  }
}

const taskSchema = {
  type: 'object', additionalProperties: false, required: ['tasks'], properties: {
    tasks: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['title', 'description', 'priority'], properties: {
        title: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string', enum: ['Low', 'Medium', 'High'] }
      }
    } }
  }
};
const breakdownSchema = {
  type: 'object', additionalProperties: false, required: ['subtasks'], properties: {
    subtasks: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['title'], properties: { title: { type: 'string' } }
    } }
  }
};

function extractOutput(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  const parts = [];
  for (const item of data?.output || []) for (const content of item?.content || []) {
    if (content?.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
  }
  return parts.join('\n');
}

function validateList(data, key, breakdown, maxItems = 8) {
  const list = data?.[key];
  if (!Array.isArray(list) || list.length < 1) throw new AiProviderError('The AI provider returned no usable suggestions. Please try again.', 502);
  const clean = list.slice(0, maxItems).map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new AiProviderError('The AI provider returned an invalid response. Please try again.', 502);
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (title.length < 2 || title.length > 160) throw new AiProviderError('The AI provider returned an invalid response. Please try again.', 502);
    if (breakdown) return { title };
    const description = typeof item.description === 'string' ? item.description.trim() : '';
    if (description.length > 3000 || !['Low', 'Medium', 'High'].includes(item.priority)) throw new AiProviderError('The AI provider returned an invalid response. Please try again.', 502);
    return { title, description, priority: item.priority };
  });
  return clean;
}

function createAiProvider({ fetchImpl = globalThis.fetch, env = process.env } = {}) {
  async function request({ instructions, input, name, schema, kind, maxItems = 8 }) {
    if ((env.AI_PROVIDER || 'groq').toLowerCase() !== 'groq') throw new AiProviderError('The configured AI provider is not supported.', 503);
    if (!env.GROQ_API_KEY || !env.GROQ_MODEL) throw new AiProviderError('AI assistance is not configured. Set GROQ_API_KEY and GROQ_MODEL in backend/.env.', 503);
    let response;
    try {
      response = await fetchImpl('https://api.groq.com/openai/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          model: env.GROQ_MODEL, instructions, input,
          text: { format: { type: 'json_schema', name, strict: true, schema } }
        })
      });
    } catch {
      throw new AiProviderError('The AI provider could not be reached. Please try again later.', 502);
    }
    if (!response.ok) throw new AiProviderError('The AI provider could not complete this request. Please try again later.', 502);
    let body;
    try { body = await response.json(); } catch { throw new AiProviderError('The AI provider returned an invalid response. Please try again.', 502); }
    let parsed;
    try { parsed = JSON.parse(extractOutput(body)); } catch { throw new AiProviderError('The AI provider returned an invalid response. Please try again.', 502); }
    return validateList(parsed, kind, kind === 'subtasks', maxItems);
  }

  return {
    suggestTasks: ({ project, existingTitles }) => request({
      name: 'task_suggestions', schema: taskSchema, kind: 'tasks',
      instructions: 'Create between 1 and 8 practical, distinct project tasks based on the provided project brief. Return concise task titles, actionable descriptions, and Low, Medium, or High priority. Do not include due dates or assumptions not present in the project brief.',
      input: JSON.stringify({ projectName: project.name, projectDescription: project.description, existingTaskTitles: existingTitles })
    }),
    breakDownTask: ({ task, maxSubtasks = 8 }) => request({
      name: 'task_breakdown', schema: breakdownSchema, kind: 'subtasks', maxItems: maxSubtasks,
      instructions: `Break the task into up to ${maxSubtasks} distinct, actionable subtasks. Titles must be specific and concise.`,
      input: JSON.stringify({ title: task.title, description: task.description })
    })
  };
}

module.exports = { createAiProvider, AiProviderError, validateList };
