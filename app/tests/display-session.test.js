// Run with: node --experimental-test-module-mocks --test tests/display-session.test.js
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const lookups=[];
mock.module('../src/db.js', {namedExports:{
  one:async (sql,params)=>{lookups.push({sql,params});return params[0]==='saved'&&params[1]==='owner'
    ? {id:'saved',name:'Kitchen',settings:{view:'month',showChores:false}} : null;},
  many:async()=>[],query:async()=>{throw new Error('Unexpected write');},
}});
mock.module('../src/lib/access.js',{namedExports:{assertUuid:value=>value,cleanText:value=>value}});
const requireAuth=(req,res,next)=>req.user?next():res.sendStatus(401);
mock.module('../src/lib/auth.js',{namedExports:{requireAuth,requireUser:requireAuth}});
mock.module('../src/lib/security.js',{namedExports:{
  httpError:(status,message)=>Object.assign(new Error(message),{status}),
  randomToken:()=>{throw new Error('Unexpected token rotation');},sha256:value=>value,
}});
const {default:router}=await import('../src/routes/displays.js');

test('opening a saved display uses owner authorization and leaves tokens unchanged',async()=>{
  const app=express();
  app.use((req,res,next)=>{
    if(req.headers['x-user'])req.user={id:req.headers['x-user'],name:'Owner'};
    if(req.headers['x-display'])req.display={name:'Token display',settings:{view:'week'}};
    next();
  });
  app.use(router);
  app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}));
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const url=`http://127.0.0.1:${server.address().port}/display/session?displayId=saved`;
  try{
    const response=await fetch(url,{headers:{'x-user':'owner'}});
    assert.equal(response.status,200);
    const data=await response.json();
    assert.equal(data.display.name,'Kitchen');assert.equal(data.settings.view,'month');
    assert.equal(data.settings.showChores,false);
    assert.deepEqual(lookups[0].params,['saved','owner']);
    assert.match(lookups[0].sql,/user_id = \$2/);
    assert.equal((await fetch(url,{headers:{'x-user':'other'}})).status,404);
    assert.equal((await fetch(url)).status,401);
    assert.equal((await fetch(url,{headers:{'x-user':'owner','x-display':'token'}})).status,403);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
