'use strict';
const crypto=require('crypto');
const definition={name:'UUID Generator',method:'GET',path:'/v1/tools/uuid',category:'Tools',description:'Generate cryptographically strong UUID v4 identifiers.'};
function register(app,{API_PREFIX,sendResult}){app.get(`${API_PREFIX}/tools/uuid`,(req,res)=>sendResult(res,req,Date.now(),200,{status:true,uuid:crypto.randomUUID()}));}
module.exports={definition,register};
