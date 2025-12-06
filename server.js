const express = require('express');
const dotenv = require('dotenv');
dotenv.config();
if (process.env.TLS_REJECT_UNAUTHORIZED === '0') { process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; }
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));
app.use('/dashboard', express.static('./dashboard'));
const port = process.env.SERVER_PORT || 8000;
const healthcheck = require('./src/modules/healthcheck');
const listener = require('./src/device/listener');
const syncService = require('./src/services/syncService');
const devicesModel = require('./src/database/models/devices');
const db = require('./src/database/connection');
const schema = require('./src/database/schema');
const fs = require('fs');
const healthpush = require('./src/modules/healthpush');
const dbwatch = require('./src/modules/dbwatch');
const dashboardService = require('./src/services/dashboardService');
listener.register(app);
const pushCounters = new Map();
app.get('/push', async (req, res) => {
  try {
    const ipAddr = (req.ip||'').replace('::ffff:','');
    const deviceId = String(req.query?.deviceId || ipAddr);
    const device = await devicesModel.getByIp(ipAddr).catch(()=>null);
    await require('./src/database/models/eventos_dispositivo').add({ device_id: device?.id || null, device_ip: ipAddr, event_type: 'push', payload: { query: req.query } });
    if (!pushCounters.has(deviceId)) pushCounters.set(deviceId, 0);
    const c = (pushCounters.get(deviceId) || 0) + 1;
    pushCounters.set(deviceId, c);
    if (c % 6 === 1) {
      return res.json({ verb: 'POST', endpoint: 'set_configuration', body: { general: { language: 'pt_BR' } }, contentType: 'application/json' });
    } else if (c % 6 === 3) {
      return res.json({ verb: 'POST', endpoint: 'set_configuration', body: { general: { language: 'en_US' } }, contentType: 'application/json' });
    } else if (c % 6 === 5) {
      return res.json({ verb: 'POST', endpoint: 'set_configuration', body: { general: { language: 'spa_SPA' } }, contentType: 'application/json' });
    } else {
      return res.send();
    }
  } catch(e){ res.status(500).json({ error:e.message }); }
});
app.post('/result', async (req, res) => {
  try {
    const ipAddr = (req.ip||'').replace('::ffff:','');
    const device = await devicesModel.getByIp(ipAddr).catch(()=>null);
    await require('./src/database/models/eventos_dispositivo').add({ device_id: device?.id || null, device_ip: ipAddr, event_type: 'push_result', payload: req.body });
    res.json({ ok:true });
  } catch(e){ res.status(500).json({ error:e.message }); }
});
async function ensureEnvDevicesInDb(){
  const envs = parseEnvDevices();
  for (const d of envs){
    const existing = await devicesModel.getByIp(d.ip).catch(()=>null);
    if (!existing){ await devicesModel.add({ nome: d.nome, ip: d.ip, porta: d.porta, tipo:'catraca', push_enabled: process.env.PUSH_DEFAULT_ENABLED==='true', meta:{} }); }
  }
}
app.get('/health', async (req, res) => {
  try {
    const result = await healthcheck.run();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/', (req,res)=>{ res.redirect('/dashboard'); });
app.get('/api/dashboard/status', async (req,res)=>{
  try {
    const dbStatus = await dashboardService.dbStatus();
    const ischolar = await dashboardService.ischolarStatus();
    const devices = await getEnvDevicesWithStatus();
    const pushGlobal = process.env.PUSH_DEFAULT_ENABLED === 'true';
    res.json({ db: dbStatus, ischolar, devices, pushGlobal });
  } catch(e){ res.status(500).json({ error:e.message }); }
});
app.get('/api/dashboard/alerts', async (req,res)=>{
  try {
    const dbStatus = await dashboardService.dbStatus();
    const ischolar = await dashboardService.ischolarStatus();
    const devices = await getEnvDevicesWithStatus();
    const alerts = [];
    if (dbStatus !== 'ONLINE') alerts.push({ severity:'critical', code:'DB_OFFLINE', message:'Banco de dados offline' });
    if (ischolar !== 'OK'){
      const sev = ischolar === 'SEM TOKEN' ? 'warn' : 'error';
      const code = ischolar === 'SEM TOKEN' ? 'ISCHOLAR_TOKEN_MISSING' : 'ISCHOLAR_FAIL';
      const message = ischolar === 'SEM TOKEN' ? 'Token do iScholar ausente' : 'Falha na comunicação com iScholar';
      alerts.push({ severity: sev, code, message });
    }
    devices.filter(d=> !d.online).forEach(d=> alerts.push({ severity:'error', code:'DEVICE_OFFLINE', message:`Dispositivo offline: ${d.nome||d.ip}`, meta:{ id:d.id, ip:d.ip } }));
    devices.filter(d=> d.latency !== null && d.latency > parseInt(process.env.LATENCY_WARN_MS||'800',10)).forEach(d=> alerts.push({ severity:'warn', code:'HIGH_LATENCY', message:`Alta latência: ${d.nome||d.ip} ${d.latency}ms`, meta:{ id:d.id, ip:d.ip, latency:d.latency } }));
    res.json({ alerts });
  } catch(e){ res.status(500).json({ error:e.message }); }
});
app.get('/api/devices', async (req,res)=>{ try { res.json({ items: await getEnvDevicesWithStatus() }); } catch(e){ res.status(500).json({error:e.message}); }});
app.post('/api/devices', (req,res)=> res.status(405).json({ error:'disabled' }));
app.put('/api/devices/:id', (req,res)=> res.status(405).json({ error:'disabled' }));
app.delete('/api/devices/:id', (req,res)=> res.status(405).json({ error:'disabled' }));
app.post('/api/devices/:id/push-toggle', async (req,res)=>{
  try {
    const id = req.params.id;
    let dev = null;
    const envDev = parseEnvDevices().find(x=> x.id === id);
    if (envDev){ dev = await devicesModel.getByIp(envDev.ip); if (!dev) { await devicesModel.add({ nome: envDev.nome, ip: envDev.ip, porta: envDev.porta, tipo:'catraca', push_enabled: !!req.body.enabled, meta:{} }); dev = await devicesModel.getByIp(envDev.ip); } else { dev.push_enabled = !!req.body.enabled; await devicesModel.update(dev.id, dev); } }
    if (!dev) return res.status(404).json({ error:'not found' });
    res.json({ ok:true, enabled: !!dev.push_enabled });
  } catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/devices/:id/push-test', async (req,res)=>{
  try {
    const id = req.params.id;
    const envDev = parseEnvDevices().find(x=> x.id === id);
    if (!envDev) return res.status(404).json({ error:'not found' });
    const dbDev = await devicesModel.getByIp(envDev.ip).catch(()=>null);
    const dev = dbDev || { id: 0, nome: envDev.nome, ip: envDev.ip, porta: envDev.porta, tipo:'catraca', push_enabled: false, meta:{} };
    const r = await healthpush.pushOnce(dev);
    res.json(r);
  } catch(e){ res.status(500).json({error:e.message}); }
});
app.get('/api/stats/daily', async (req,res)=>{ try { res.json(await dashboardService.daily()); } catch(e){ res.status(500).json({error:e.message}); }});
app.get('/api/stats/users', async (req,res)=>{ try { res.json(await dashboardService.users()); } catch(e){ res.status(500).json({error:e.message}); }});
app.get('/api/stats/last-accesses', async (req,res)=>{ try { res.json({ items: await dashboardService.lastAccesses(20) }); } catch(e){ res.status(500).json({error:e.message}); }});
app.get('/api/dashboard/logs', async (req,res)=>{
  try {
    const events = await db.all('SELECT created_at as ts, event_type as type, device_id, device_ip FROM eventos_dispositivo ORDER BY id DESC LIMIT 20', []);
    const accesses = await db.all('SELECT timestamp as ts, event as type, device_id, device_ip, allowed FROM logs_acesso ORDER BY id DESC LIMIT 20', []);
    res.json({ events, accesses });
  } catch(e){ res.status(500).json({ error:e.message }); }
});
const dbPath = process.env.SQLITE_PATH || './DATA/catraca.db';
const missingBeforeInit = !fs.existsSync(dbPath);
db.init().then(async ()=>{
  if (missingBeforeInit) { try { console.log('Running bancoinicial.js (startup)'); await dbwatch.runInitScript(); } catch {} }
  try { await schema.ensure(); } catch {}
  try { await ensureEnvDevicesInDb(); } catch {}
  try { await dbwatch.check(); } catch {}
  try { syncService.start(); } catch {}
}).catch(()=>{});
function listen(p){
  const s = app.listen(p, () => {
    console.log('Servidor iniciado na porta', p);
    console.log('Dashboard em', `http://localhost:${p}/dashboard`);
  });
  s.on('error', (e)=>{
    if (e && e.code === 'EADDRINUSE') { const np = parseInt(p,10)+1; listen(np); } else { console.error('Server listen error', e && e.message ? e.message : String(e)); }
  });
}
listen(port);
setInterval(()=> healthpush.run().catch(()=>{}), parseInt(process.env.HEALTHCHECK_INTERVAL_MS || '30000',10));
dbwatch.start();
try { require('./src/modules/dbwatch').startBackup(); } catch(e) {}
function parseEnvDevices(){
  const seen = new Map();
  const byList = (process.env.CONTROLID_DEVICES||'').split(',').map(s=> s.trim()).filter(Boolean);
  byList.forEach((ip)=>{ if (ip && !seen.has(ip)) seen.set(ip, { ip, porta: 80 }); });
  Object.keys(process.env).forEach(k=>{
    const m = k.match(/^DEVICE_(\d+)_IP$/);
    if (m){ const n = m[1]; const ip = (process.env[k]||'').trim(); const port = parseInt(process.env[`DEVICE_${n}_PORT`]||'80',10);
      if (!ip) return;
      if (!seen.has(ip)) seen.set(ip, { ip, porta: port });
      else { const cur = seen.get(ip); cur.porta = port || cur.porta; seen.set(ip, cur); }
    }
  });
  const map = [];
  let idx = 0;
  for (const v of seen.values()){ idx++; map.push({ id:`env-${idx}`, nome:`Catraca ${idx}`, ip: v.ip, porta: v.porta }); }
  return map;
}
async function getEnvDevicesWithStatus(){
  const envs = parseEnvDevices();
  const limitMS = parseInt(process.env.DASHBOARD_STATUS_TIMEOUT_MS || '3000', 10);
  const withTimeout = (promise, ms) => new Promise((resolve) => {
    let done = false;
    promise.then((v)=>{ if(!done){ done=true; resolve(v); } }).catch(()=>{ if(!done){ done=true; resolve({ online:false, latency:null }); } });
    setTimeout(()=>{ if(!done){ done=true; resolve({ online:false, latency:null }); } }, ms);
  });
  const promises = envs.map(async (d) => {
    const status = await withTimeout(dashboardService.deviceStatus(d.ip, d.porta), limitMS);
    const push = await devicesModel.getByIp(d.ip).then(r=> (r && r.push_enabled)?true:false).catch(()=> (process.env.PUSH_DEFAULT_ENABLED==='true'));
    return { id: d.id, nome: d.nome, ip: d.ip, porta: d.porta, online: status.online, latency: status.latency, push_enabled: push };
  });
  const results = await Promise.allSettled(promises);
  return results.filter(r=> r.status==='fulfilled').map(r=> r.value);
}
