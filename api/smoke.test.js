'use strict';
const fs=require('fs'); const path=require('path');
const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
const checks=[
['email registration',"app.post('/auth/register'"],['email login',"app.post('/auth/login'"],['session check',"app.get('/auth/me'"],['logout',"app.post('/auth/logout'"],['ping endpoint','tools/ping'],['API key auth','requireApiKey'],['payment approval','/admin/api/payments/:reference/approve'],['payment rejection','/admin/api/payments/:reference/reject'],['endpoint manager','/admin/api/endpoints'],['users table','CREATE TABLE IF NOT EXISTS users'],['API keys table','CREATE TABLE IF NOT EXISTS api_keys'],['subscriptions table','CREATE TABLE IF NOT EXISTS subscriptions'],['payments table','CREATE TABLE IF NOT EXISTS payments']];
for(const [name,needle] of checks) if(!server.includes(needle)) throw new Error('Missing '+name);
for(const file of ['public/dashboard.html','public/admin.html','public/docs.html']) if(!fs.existsSync(path.join(__dirname,file))) throw new Error('Missing '+file);
console.log('ZUKO API smoke checks: PASS');
