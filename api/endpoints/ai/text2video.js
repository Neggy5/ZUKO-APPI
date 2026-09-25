'use strict';

const text2video = require('../../lib/text2video');

module.exports = {
  name: 'Text to Video (LTX free)',
  method: 'GET',
  path: '/v1/ai/text2video',
  category: 'AI',
  description:
    'Free text-to-video via Lightricks LTX (Hugging Face Space). Query: prompt (required), duration (1-5), width, height, negative, seed.',

  async execute({ query }) {
    const prompt = String(query.prompt || query.text || query.q || '').trim();
    if (!prompt) {
      return { statusCode: 400, data: { status: false, error: 'prompt is required' } };
    }

    try {
      const result = await text2video.generate(prompt, {
        duration: query.duration || query.seconds,
        width: query.width,
        height: query.height,
        negative: query.negative,
        seed: query.seed,
      });
      return {
        status: true,
        success: true,
        result: {
          prompt: result.prompt,
          video_url: result.video_url,
          download_url: result.download_url,
          url: result.video_url,
          width: result.width,
          height: result.height,
          duration: result.duration,
          source: result.source,
        },
      };
    } catch (e) {
      return {
        statusCode: e.statusCode || 502,
        data: {
          status: false,
          error: e.message || 'Text-to-video failed.',
          source: 'ltx-video-distilled',
        },
      };
    }
  },
};
