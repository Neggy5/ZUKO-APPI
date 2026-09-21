'use strict';
const crypto = require('crypto');
const definition = { name:'Hash', method:'POST', path:'/v1/tools/hash', category:'Tools', description:'Create a cryptographic digest locally on the ZUKO server.' };
function register(app, { API_PREFIX, cleanString, sendResult }) {
  app.post(`${API_PREFIX}/tools/hash`, (req,res) => {
    const started=Date.now();
    const text=cleanString(req.body?.text,10000);
    const algorithm=cleanString(req.body?.algorithm||'sha256',30).toLowerCase();
    const allowed=['sha256','sha512','sha1','md5'];
    if(!text) return sendResult(res,req,started,400,{status:false,error:'text is required'});
    if(!allowed.includes(algorithm)) return sendResult(res,req,started,400,{status:false,error:`algorithm must be one of: ${allowed.join(', ')}`});
    const hash=crypto.createHash(algorithm).update(text,'utf8').digest('hex');
    return sendResult(res,req,started,200,{status:true,algorithm,hash});
  });
}
module.exports={definition,register};
