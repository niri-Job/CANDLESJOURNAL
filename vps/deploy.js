const { Client } = require('ssh2');
const path   = require('path');
const crypto = require('crypto');

const PASS = 'BeckyNiri2024';
const HOST = '62.171.183.87';
const BASE = 'C:/Users/Job Niri Joseph/candlesjournal/vps';

const fernetKey = crypto.randomBytes(32).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_');

const ALGO = {
  algorithms: {
    kex:           ['curve25519-sha256','ecdh-sha2-nistp256','diffie-hellman-group14-sha256'],
    cipher:        ['aes256-gcm','aes128-gcm','aes256-ctr','aes128-ctr'],
    serverHostKey: ['ssh-ed25519','ecdsa-sha2-nistp256','ssh-rsa'],
    hmac:          ['hmac-sha2-256','hmac-sha2-512'],
  },
};

function connect() {
  return new Promise((res, rej) => {
    const c = new Client();
    c.on('ready', () => res(c))
     .on('error', rej)
     .connect({ host: HOST, port: 22, username: 'root', password: PASS,
                tryKeyboard: true, readyTimeout: 15000, ...ALGO });
  });
}

function run(c, cmd) {
  return new Promise((res, rej) => {
    c.exec(cmd, (err, s) => {
      if (err) return rej(err);
      let out = '', er = '';
      s.on('data', d => { out += d; });
      s.stderr.on('data', d => { er += d; });
      s.on('close', code => res({ code, out, err: er }));
    });
  });
}

function getSftp(c) {
  return new Promise((res, rej) => c.sftp((e, s) => e ? rej(e) : res(s)));
}

function mkdirp(sftp, dir) {
  return new Promise(res => sftp.mkdir(dir, () => res()));
}

function put(sftp, local, remote) {
  return new Promise((res, rej) => sftp.fastPut(local, remote, e => e ? rej(e) : res()));
}

function writeStr(sftp, remote, content) {
  return new Promise((res, rej) => {
    const ws = sftp.createWriteStream(remote);
    ws.on('close', res);
    ws.on('error', rej);
    ws.end(content);
  });
}

async function main() {
  console.log('Connecting to', HOST, '...');
  const c = await connect();
  console.log('Connected OK');

  const sftp = await getSftp(c);
  await mkdirp(sftp, '/tmp/niri');
  await mkdirp(sftp, '/tmp/niri/app');
  console.log('Remote directories ready');

  const files = [
    ['setup.sh',                '/tmp/niri/setup.sh'],
    ['niri-sync.service',       '/tmp/niri/niri-sync.service'],
    ['mt5-terminal.service',    '/tmp/niri/mt5-terminal.service'],
    ['mt5linux-bridge.service', '/tmp/niri/mt5linux-bridge.service'],
    ['nginx.conf',              '/tmp/niri/nginx.conf'],
    ['app/main.py',             '/tmp/niri/app/main.py'],
    ['app/mt5_manager.py',      '/tmp/niri/app/mt5_manager.py'],
    ['app/requirements.txt',    '/tmp/niri/app/requirements.txt'],
    ['app/.env.example',        '/tmp/niri/app/.env.example'],
  ];

  for (const [rel, remote] of files) {
    const local = BASE + '/' + rel;
    process.stdout.write('  uploading ' + rel + ' ... ');
    await put(sftp, local, remote);
    console.log('ok');
  }

  // Load secrets from environment — never commit actual values
  const supabaseUrl  = process.env.SUPABASE_URL  || 'https://YOUR_PROJECT.supabase.co';
  const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SERVICE_ROLE_KEY';
  const jwtSecret    = process.env.SUPABASE_JWT_SECRET       || 'YOUR_JWT_SECRET';

  const env = [
    'SUPABASE_URL=' + supabaseUrl,
    'SUPABASE_SERVICE_ROLE_KEY=' + serviceKey,
    'SUPABASE_JWT_SECRET=' + jwtSecret,
    'FERNET_KEY=' + fernetKey,
    'MT5_BRIDGE_HOST=localhost',
    'MT5_BRIDGE_PORT=18812',
    'SYNC_INTERVAL=60',
    'API_HOST=127.0.0.1',
    'API_PORT=8000',
    'DB_PATH=/opt/niri-sync/connections.db',
  ].join('\n') + '\n';

  await writeStr(sftp, '/tmp/niri/app/.env', env);
  console.log('  .env written');
  console.log('  FERNET_KEY =', fernetKey);

  // Permissions
  await run(c, 'chmod +x /tmp/niri/setup.sh');

  // Ensure screen is installed then launch in detached session
  await run(c, 'apt-get install -y screen -qq 2>/dev/null || true');
  const launch = await run(c,
    'screen -dmS niri-setup bash -c ' +
    '"cd /tmp/niri && bash setup.sh > /tmp/niri-setup.log 2>&1; echo DONE:$? >> /tmp/niri-setup.log"'
  );
  console.log('screen launch exit:', launch.code, launch.err.trim() || 'ok');

  // Give it 4 seconds to start, then snapshot the log
  await new Promise(r => setTimeout(r, 4000));
  const snap = await run(c, 'screen -ls; echo "---LOG---"; head -30 /tmp/niri-setup.log 2>/dev/null');
  console.log('\n=== VPS STATUS ===');
  console.log(snap.out);

  c.end();
  console.log('Done. Setup is running in background — check /tmp/niri-setup.log on the VPS.');
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1); });
