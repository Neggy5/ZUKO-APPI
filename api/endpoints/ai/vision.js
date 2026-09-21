'use strict';
const axios = require('axios');

const BASE = String(process.env.VISION_API_BASE || 'https://apispec.litype.workers.dev/visionai/qwen').replace(/\/$/, '');
module.exports = {
  name:'Vision AI', method:'POST', path:'/v1/ai/vision', category:'AI',
  description:'Analyze or describe a publicly accessible image URL with Qwen Vision.',
  async execute({ body }) {
    const image = String(body.image || body.url || '').trim();
    const detail = String(body.detail || 'detailed').trim();
    const mode = String(body.mode || 'analyze').toLowerCase();
    if (!/^https?:\/\//i.test(image)) return { statusCode:400, data:{status:false,error:'image must be a public http(s) image URL.'} };
    if (!['analyze','describe'].includes(mode)) return { statusCode:400, data:{status:false,error:'mode must be analyze or describe.'} };
    const endpoint = `${BASE}/${mode}`;
    const response = await axios.post(endpoint, { image, detail }, { timeout:30000, validateStatus:()=>true, headers:{'Content-Type':'application/json'} });
    if (response.status >= 400) return { statusCode:502, data:{status:false,error:'Vision provider returned an error.',providerStatus:response.status,provider:response.data} };
    return { status:true, provider:'qwen-vision', mode, result:response.data };
  }
};
