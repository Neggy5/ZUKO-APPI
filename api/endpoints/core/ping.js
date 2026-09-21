'use strict';
const definition={name:'API Ping',method:'GET',path:'/v1/tools/ping',category:'Core',description:'Authenticated health check for API clients.'};
function register(app,{API_PREFIX,sendResult,API_NAME,nowIso}){app.get(`${API_PREFIX}/tools/ping`,(req,res)=>sendResult(res,req,Date.now(),200,{status:true,message:'pong',service:API_NAME,time:nowIso(),plan:req.apiKey.plan}));}
module.exports={definition,register};
