const dotenv = require('dotenv');
dotenv.config();
const schema = require('./src/database/schema');
const devices = require('./src/database/models/devices');
const syncService = require('./src/services/syncService');

(async () => {
  try {
    await schema.ensure();
    const list = (process.env.CONTROLID_DEVICES || '').split(',').map(s=> s.trim()).filter(Boolean);
    const login = process.env.CONTROLID_LOGIN || 'admin';
    const password = process.env.CONTROLID_PASSWORD || 'admin';
    for (const ip of list){
      await devices.add({ nome: ip, ip, porta: 80, tipo: 'catraca', status: 'unknown', ultimo_contato: '', push_enabled: process.env.PUSH_DEFAULT_ENABLED==='true', meta: { login, password } });
    }
    try { await syncService.syncAll(); } catch {}
    console.log(JSON.stringify({ ok: true }));
    process.exit(0);
  } catch (e) {
    console.error(e && e.message ? e.message : String(e));
    process.exit(1);
  }
})();
