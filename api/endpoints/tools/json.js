'use strict';
const definition={name:'JSON Formatter',method:'POST',path:'/v1/tools/json',category:'Tools',description:'Validate and format JSON locally.'};
function register(app,{API_PREFIX,cleanString,sendResult}){app.post(`${API_PREFIX}/tools/json`,(req,res)=>{const started=Date.now();const raw=typeof req.body?.json==='string'?req.body.json:'';if(!raw||raw.length>50000)return sendResult(res,req,started,400,{status:false,error:'json is required and must be <= 50,000 characters'});try{const parsed=JSON.parse(raw);return sendResult(res,req,started,200,{status:true,valid:true,result:JSON.stringify(parsed,null,2)});}catch(e){return sendResult(res,req,started,400,{status:false,valid:false,error:e.message});}});}
module.exports={definition,register};
