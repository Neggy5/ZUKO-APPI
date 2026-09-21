'use strict';

const axios = require('axios');

const definition = {
  name: 'AI Chat',
  method: 'POST',
  path: '/v1/ai/chat',
  category: 'AI',
  description: 'Chat with ZUKO AI through the configured server-side model.'
};

const AI_BASE_URL = String(process.env.AI_BASE_URL || 'https://api.atria-asi.ai/v1').replace(/\/$/, '');
const AI_MODEL = String(process.env.AI_MODEL || 'Atria-Dawn-Preview');
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 60000);
const MAX_MESSAGE_CHARS = Number(process.env.AI_MAX_MESSAGE_CHARS || 12000);
const MAX_MESSAGES = Number(process.env.AI_MAX_MESSAGES || 20);

function extractText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(part => typeof part === 'string' ? part : part?.text || '').join('').trim();
  }
  return '';
}

function normalizeMessages(body) {
  if (Array.isArray(body?.messages) && body.messages.length) {
    return body.messages.slice(-MAX_MESSAGES).map((m) => ({
      role: ['system', 'user', 'assistant'].includes(m?.role) ? m.role : 'user',
      content: String(m?.content ?? '').slice(0, MAX_MESSAGE_CHARS)
    })).filter(m => m.content.trim());
  }

  const message = String(body?.message ?? body?.prompt ?? '').trim();
  if (!message) return [];
  return [{ role: 'user', content: message.slice(0, MAX_MESSAGE_CHARS) }];
}

async function execute({ body }) {
  const apiKey = String(process.env.ATRIA_API_KEY || '').trim();
  if (!apiKey) {
    return { statusCode: 503, data: { status: false, error: 'AI service is not configured.' } };
  }

  const messages = normalizeMessages(body);
  if (!messages.length) {
    return { statusCode: 400, data: { status: false, error: 'message or messages is required.' } };
  }

  const payload = {
    model: String(body?.model || AI_MODEL),
    messages
  };

  // Keep the public ZUKO contract small; only pass optional generation controls.
  for (const key of ['temperature', 'max_tokens', 'top_p', 'stream']) {
    if (body?.[key] !== undefined) payload[key] = body[key];
  }
  if (payload.stream === true) {
    return { statusCode: 400, data: { status: false, error: 'stream=true is not supported by this endpoint yet.' } };
  }

  try {
    const response = await axios.post(`${AI_BASE_URL}/chat/completions`, payload, {
      timeout: AI_TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'ZUKO-API/1.0'
      },
      validateStatus: () => true
    });

    const data = response.data || {};
    if (response.status < 200 || response.status >= 300) {
      const upstreamMessage = String(data?.error?.message || 'AI upstream request failed.').slice(0, 500);
      const statusCode = response.status === 401 || response.status === 403 ? 502 : response.status === 429 ? 429 : 502;
      return { statusCode, data: { status: false, error: upstreamMessage, upstreamStatus: response.status } };
    }

    const reply = extractText(data);
    if (!reply) {
      return { statusCode: 502, data: { status: false, error: 'AI returned an empty response.' } };
    }

    return {
      status: true,
      reply,
      model: data.model || payload.model,
      usage: data.usage || null,
      requestId: data.id || data.request_id || null
    };
  } catch (error) {
    const code = error?.code === 'ECONNABORTED' ? 'AI request timed out.' : 'AI service is temporarily unavailable.';
    return { statusCode: 502, data: { status: false, error: code } };
  }
}

module.exports = { ...definition, execute };
