'use strict';
const definition = { name:'Base64 Encode / Decode', method:'POST', path:'/v1/tools/base64', category:'Tools', description:'Encode or decode UTF-8 text using Base64 locally.' };
function register(app,{API_PREFIX,cleanString,sendResult}){
  app.post(`${API_PREFIX}/tools/base64`,(req,res)=>{
    const started=Date.now();
    const text=String(req.body?.text??'');
    const mode=cleanString(req.body?.mode||'encode',20).toLowerCase();
    if(text.length>10000) return sendResult(res,req,started,400,{status:false,error:'text is too long'});
    if(!['encode','decode'].includes(mode)) return sendResult(res,req,started,400,{status:false,error:'mode must be encode or decode'});
    try{
      const result=mode==='encode'?Buffer.from(text,'utf8').toString('base64'):Buffer.from(text,'base64').toString('utf8');
      return sendResult(res,req,started,200,{status:true,mode,result});
    }catch{return sendResult(res,req,started,400,{status:false,error:'Invalid Base64 input.'});}
  });
}
module.exports={definition,register};
