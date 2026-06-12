/**
 * Xiaomi Bulk Registration — Browserless HTTP-only
 * Flow: FLOW.md (8 langkah)
 * + Telegram notification on success
 * + Referral code application post-registration
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import forge from 'node-forge';
import { chromium } from 'playwright';
import { ImapFlow } from 'imapflow';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually
const envPath = resolve(__dirname, '.env');
const envObj = {};
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
  const idx = trimmed.indexOf('=');
  envObj[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
}

const TWOCAPTCHA_API_KEY = envObj.TWOCAPTCHA_API_KEY;
const GMAIL_USER = envObj.GMAIL_USER;
const GMAIL_APP_PASSWORD = envObj.GMAIL_APP_PASSWORD;
// Support multiple domains (comma-separated in .env)
const DOMAINS = (envObj.DOMAIN || 'batakbersatu.my.id').split(',').map(d => d.trim()).filter(Boolean);
function pickDomain() { return DOMAINS[Math.floor(Math.random() * DOMAINS.length)]; }
const TELEGRAM_BOT_TOKEN = envObj.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = envObj.TELEGRAM_CHAT_ID || '';
const PASSWORD = envObj.PASSWORD || 'Xiaomigey1!';
const COUNT = envObj.COUNT || '5';
const REFERRAL_CODE = envObj.REFERRAL_CODE || 'CLAYQ4';
const REFERRAL_DELAY = parseInt(envObj.REFERRAL_DELAY) || 120;

// ─── Proxy Setup ───
const PROXY_URL = envObj.PROXY_URL || "";
let proxyAgent = null;
if (PROXY_URL) {
  const { ProxyAgent } = await import("undici");
  proxyAgent = new ProxyAgent({ uri: PROXY_URL });
  console.log("\x1b[36m⚡ Proxy:\x1b[0m " + PROXY_URL.replace(/:[^:@]+@/, ":***@"));
}

async function proxyFetch(url, opts = {}) {
  if (proxyAgent) opts.dispatcher = proxyAgent;
  return fetch(url, opts);
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
const CAPTCHA_SITE_KEY = '6LeBM0ocAAAAAEwYcFUjtxpVbs-0rnbSVXBBXmh4';
const CAPTCHA_DATA_KEY = '8027422fb0eb42fbac1b521ec4a7961f';
const REGISTER_PAGE = 'https://global.account.xiaomi.com/fe/service/register?_locale=en_US&_uRegion=ID&ref=CLAYQ4';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── RSA Public Keys ───
const CAPTCHA_RSA_PEM = [
  '-----BEGIN PUBLIC KEY-----',
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArxfNLkuAQ/BYHzkzVwtu',
  'g+0abmYRBVCEScSzGxJIOsfxVzcuqaKO87H2o2wBcacD3bRHhMjTkhSEqxPjQ/FE',
  'XuJ1cdbmr3+b3EQR6wf/cYcMx2468/QyVoQ7BADLSPecQhtgGOllkC+cLYN6Md34',
  'Uii6U+VJf0p0q/saxUTZvhR2ka9fqJ4+6C6cOghIecjMYQNHIaNW+eSKunfFsXVU',
  '+QfMD0q2EM9wo20aLnos24yDzRjh9HJc6xfr37jRlv1/boG/EABMG9FnTm35xWrV',
  'R0nw3cpYF7GZg13QicS/ZwEsSd4HyboAruMxJBPvK3Jdr4ZS23bpN0cavWOJsBqZ',
  'VwIDAQAB',
  '-----END PUBLIC KEY-----'
].join('\n');

const EUI_RSA_PEM = [
  '-----BEGIN PUBLIC KEY-----',
  'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCYEVrK/4Mahiv0pUJgTybx4J9P',
  '5dUT/Y0PuwMbk+gMU+jrZnBiXGv6/hCH1avIhoBcE535F8nJQQN3UavZdFkYids',
  'oXuEnat3+eVTp3FslyhRwIBDF09v4vDhRtxFOT+R7uH7h/mzmyA2/+lfIMWGIrff',
  'XprYizbV76+YQKhoqFQIDAQAB',
  '-----END PUBLIC KEY-----'
].join('\n');

// ─── Fingerprint Payload ───
function buildPayload() {
  const now = Date.now();
  return {
    type: 0, startTs: now,
    endTs: now + 800 + Math.floor(Math.random() * 400),
    env: {
      p1: '0.1', p2: 'pc-Chrome148', p3: 'Windows NT 10.0; Win64; x64',
      p4: 'Gecko', p5: 'en-US', p6: 'Netscape', p7: 'Mozilla', p8: true,
      p9: UA, p10: 0, p11: now,
      p12: 1920, p13: 1080, p14: 1920, p15: 1080, p16: 1920, p17: 1080,
      p18: REGISTER_PAGE, p19: 5,
      p20: forge.util.bytesToHex(forge.random.getBytesSync(20)),
      p21: 'Pd369809e2cf9b3e61d61254f48e6a98e6abe02ed,Cf5de68f67482549f612c4c553c1a8d44de2fd042,M0c8ad6916ae9493e506332df0ddbf245659ad2de,W26c61e60e6329023c3daad583513d7c4e6331c3a',
      p22: 0, p23: 'da39a3ee5e6b4b0d3255bfef95601890afd80709', p24: '',
      p25: forge.util.bytesToHex(forge.random.getBytesSync(20)),
      p26: forge.util.bytesToHex(forge.random.getBytesSync(20)),
      p28: '', p29: 107, p30: 10, p31: 10, p32: '0.73',
      p33: [], p34: REGISTER_PAGE
    },
    action: {
      a1: [1920, 1080], a2: [],
      a3: [[657, 599, 99], [827, 702, 690]], a4: [],
      a5: [[657, 599, 83], [827, 702, 685]],
      a6: [], a7: [], a8: [99], a9: [98, 689],
      a10: [], a11: [], a12: [], a13: [], a14: []
    },
    force: true, talkBack: false,
    nonce: { t: Math.floor(now / 1000), r: Math.floor(Math.random() * 2147483647) },
    version: '2.0', scene: 'register'
  };
}

// ─── Crypto ───
function randomAesKey(len = 16) { return forge.random.getBytesSync(len); }

function encryptSD(payload) {
  const aesKey = randomAesKey(16);
  const iv = '0102030405060708';
  const cipher = forge.cipher.createCipher('AES-CBC', aesKey);
  cipher.start({ iv });
  cipher.update(forge.util.createBuffer(forge.util.encodeUtf8(JSON.stringify(payload))));
  cipher.finish();
  const d = forge.util.encode64(cipher.output.getBytes());
  const rsaPub = forge.pki.publicKeyFromPem(CAPTCHA_RSA_PEM);
  const s = forge.util.encode64(rsaPub.encrypt(forge.util.encode64(aesKey), 'RSAES-PKCS1-V1_5'));
  return { s, d };
}

function encryptEUI(email, password) {
  const aesKey = randomAesKey(16);
  const iv = '0102030405060708';
  function encField(v) {
    const cipher = forge.cipher.createCipher('AES-CBC', aesKey);
    cipher.start({ iv });
    cipher.update(forge.util.createBuffer(forge.util.encodeUtf8(v)));
    cipher.finish();
    return forge.util.encode64(cipher.output.getBytes());
  }
  const encEmail = encField(email);
  const encPass = encField(password);
  const rsaPub = forge.pki.publicKeyFromPem(EUI_RSA_PEM);
  const encKey = forge.util.encode64(rsaPub.encrypt(forge.util.encode64(aesKey), 'RSAES-PKCS1-V1_5'));
  const eui = encKey + '.' + forge.util.encode64('email,password');
  return { eui, encEmail, encPass };
}

// ─── Step 2: Init Captcha ───
async function initCaptcha() {
  const { s, d } = encryptSD(buildPayload());
  const params = new URLSearchParams({ s, d, a: 'register' });
  const url = `https://verify.sec.xiaomi.com/captcha/v2/data?k=${CAPTCHA_DATA_KEY}&locale=en_US&_t=${Date.now()}`;
  const resp = await proxyFetch(url, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', 'Origin': 'https://global.account.xiaomi.com', 'Referer': REGISTER_PAGE },
    body: params.toString()
  });
  const json = await resp.json();
  if (json.code !== 0 || !json.data?.url) throw new Error('initCaptcha: ' + JSON.stringify(json));
  const eToken = new URL(json.data.url).searchParams.get('e');
  if (!eToken) throw new Error('No e_token');
  return eToken;
}

// ─── Step 3: Solve reCAPTCHA (parallel race — 2 tasks) ───
async function createCaptchaTask(eToken) {
  const resp = await (await proxyFetch('https://api.capsolver.com/createTask', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientKey: TWOCAPTCHA_API_KEY,
      task: {
        type: 'RecaptchaV2EnterpriseTaskProxyless',
        websiteURL: REGISTER_PAGE,
        websiteKey: CAPTCHA_SITE_KEY,
        enterprisePayload: { s: eToken }
      },
      languagePool: 'en'
    })
  })).json();
  if (resp.errorId) throw new Error('2captcha create: ' + resp.errorDescription);
  return resp.taskId;
}

async function pollCaptchaTask(taskId) {
  const poll = await (await proxyFetch('https://api.capsolver.com/getTaskResult', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientKey: TWOCAPTCHA_API_KEY, taskId })
  })).json();
  return poll;
}

async function solveCaptcha(eToken) {
  // Adaptive strategy: start with 1 task, spawn backup after 30s if still unsolved
  const BACKUP_AFTER = 30; // seconds before spawning backup task
  const POLL_INTERVAL = 3; // seconds between polls
  const MAX_WAIT = 180; // max total seconds

  const taskIds = [];
  const firstId = await createCaptchaTask(eToken);
  taskIds.push(firstId);
  log(`      ├─ Task #${firstId} (polling every ${POLL_INTERVAL}s)`);

  let backupSpawned = false;
  const startTime = Date.now();

  for (let i = 0; i < Math.floor(MAX_WAIT / POLL_INTERVAL); i++) {
    await sleep(POLL_INTERVAL * 1000);
    const elapsed = Math.floor((Date.now() - startTime) / 1000);

    // Spawn backup task after BACKUP_AFTER seconds
    if (!backupSpawned && elapsed >= BACKUP_AFTER) {
      try {
        const backupId = await createCaptchaTask(eToken);
        taskIds.push(backupId);
        backupSpawned = true;
        log(`      ├─ ⏱️  ${elapsed}s elapsed — backup task #${backupId} spawned`);
      } catch { /* ignore backup creation failure */ }
    }

    // Poll all active tasks
    for (let t = taskIds.length - 1; t >= 0; t--) {
      try {
        const poll = await pollCaptchaTask(taskIds[t]);
        if (poll.status === 'ready') {
          log(`      ├─ Solved ✓ (task #${taskIds[t]}, ${elapsed}s)`);
          return poll.solution.gRecaptchaResponse;
        }
        if (poll.errorId && poll.errorCode !== 'CAPCHA_NOT_READY') {
          throw new Error('2captcha poll: ' + poll.errorDescription);
        }
      } catch (e) {
        taskIds.splice(t, 1);
        if (taskIds.length === 0) throw e;
      }
    }
  }
  throw new Error('2captcha timeout');
}

// ─── Step 4: Verify captcha → vToken ───
async function verifyCaptcha(eToken, gToken) {
  const url = `https://verify.sec.xiaomi.com/captcha/v2/recaptcha/verify?k=${CAPTCHA_DATA_KEY}&locale=en_US&_t=${Date.now()}`;
  const resp = await proxyFetch(url, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', 'Origin': 'https://global.account.xiaomi.com', 'Referer': REGISTER_PAGE },
    body: `e=${encodeURIComponent(eToken)}&g=${encodeURIComponent(gToken)}&type=4`
  });
  const json = await resp.json();
  if (json.code !== 0 || !json.data?.result) return null;
  return json.data.token;
}

// ─── Steps 2-4 combined with retry ───
async function getCaptchaToken() {
  for (let attempt = 1; attempt <= 4; attempt++) {
    log(`   🔐 Captcha attempt ${attempt}/4`);
    try {
      const eToken = await initCaptcha();
      log(`      ├─ eToken ✓`);
      const gToken = await solveCaptcha(eToken);
      const vToken = await verifyCaptcha(eToken, gToken);
      if (vToken) { log(`      └─ vToken ✓`); return vToken; }
      log(`      └─ ⚠️  Verify failed, retrying...`);
    } catch (e) { log(`      └─ ❌ ${e.message.slice(0, 80)}`); }
  }
  return null;
}

// ─── Step 6: Send verification email ───
async function sendVerifyEmail(email, password, vToken) {
  const { eui, encEmail, encPass } = encryptEUI(email, password);
  const deviceId = 'wb_' + forge.util.bytesToHex(forge.random.getBytesSync(16));
  const cookie = `vToken=${encodeURIComponent(vToken)}; vAction=register; deviceId=${deviceId}`;
  const body = `email=${encodeURIComponent(encEmail)}&password=${encodeURIComponent(encPass)}&region=ID&sid=&icode=`;
  const resp = await proxyFetch('https://global.account.xiaomi.com/pass/sendEmailRegTicket', {
    method: 'POST',
    headers: {
      'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Origin': 'https://global.account.xiaomi.com', 'Referer': REGISTER_PAGE,
      'X-Requested-With': 'XMLHttpRequest', 'eui': eui, 'Cookie': cookie
    }, body
  });
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text.replace(/^&&&START&&&/, '')); } catch { data = { raw: text }; }
  // Capture cookies from set-cookie headers (passToken, serviceToken, userId)
  const setCookies = [];
  resp.headers.forEach((val, key) => { if (key === 'set-cookie') setCookies.push(val); });
  for (const c of setCookies) {
    const kv = c.split(';')[0];
    const [name, ...vals] = kv.split('=');
    const value = vals.join('=');
    if (name.trim() === 'passToken') data.passToken = value;
    if (name.trim() === 'serviceToken') data.serviceToken = value;
    if (name.trim() === 'userId') data.userId = data.userId || value;
    if (name.trim() === 'cUserId') data.cUserId = value;
  }
  return data;
}

// ─── Step 7: Read code via IMAP ───
async function readCode(toEmail, timeoutSec = 300) {
  const deadline = Date.now() + timeoutSec * 1000;
  const sentAfter = new Date(Date.now() - 10 * 60 * 1000); // emails from last 10 min (wider window)
  let client;
  let pollCount = 0;
  const toEmailLower = toEmail.toLowerCase();
  const emailUser = toEmailLower.split('@')[0]; // local part for fuzzy match

  try {
    client = new ImapFlow({
      host: 'imap.gmail.com', port: 993, secure: true,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
      logger: false, maxConnections: 1, disableAutoIdle: true
    });
    client.on("error", () => {});
    await client.connect();

    while (Date.now() < deadline) {
      pollCount++;
      const lock = await client.getMailboxLock('INBOX');
      try {
        const msgs = [];
        for await (const m of client.fetch(
          { from: 'noreply@notice.xiaomi.com', since: sentAfter },
          { envelope: true, source: true, uid: true }
        )) msgs.push(m);

        // Debug: show what we found on first poll
        if (pollCount === 1 && msgs.length > 0) {
          const aliases = msgs.map(m => m.envelope?.to?.[0]?.address || '?').slice(0, 5);
          log(`      📭 Found ${msgs.length} Xiaomi email(s): ${aliases.join(', ')}${msgs.length > 5 ? '...' : ''}`);
        }

        for (const m of msgs.reverse()) {
          const raw = m.source?.toString('utf8') || '';
          const rawLower = raw.toLowerCase();

          // Multi-source alias matching (envelope, headers, body)
          const envelopeTo = (m.envelope?.to || []).map(a => a.address?.toLowerCase()).join(',');
          const rawToHeader = (raw.match(/^To:\s*(.+)/mi)?.[1] || '').toLowerCase();
          const rawDeliveredTo = (raw.match(/^Delivered-To:\s*(.+)/mi)?.[1] || '').toLowerCase();

          const isMatch = envelopeTo.includes(toEmailLower)
            || rawToHeader.includes(toEmailLower)
            || rawDeliveredTo.includes(toEmailLower)
            || rawLower.includes(toEmailLower)
            || rawLower.includes(emailUser); // fuzzy: match local part anywhere in body
          if (!isMatch) continue;

          const body = raw
            .replace(/=\r?\n/g, '')
            .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/<[^>]+>/g, ' ');

          const codeMatch =
            body.match(/verification code is[:\s]*(\d{6})/i) ||
            body.match(/verification code[^0-9]{0,30}(\d{6})/i) ||
            body.match(/verify code[:\s]*(\d{6})/i) ||
            body.match(/code[:\s]+(\d{6})/i) ||
            body.match(/(\d{6})\s*is your.*code/i) ||
            body.match(/>(\d{6})</);

          if (codeMatch) {
            try { await client.messageFlagsAdd({ uid: m.uid }, ['\\Seen'], { uid: true }); } catch {}
            return codeMatch[1];
          }
        }
      } finally { lock.release(); }

      await sleep(3000);
    }

    // Timeout debug: show what emails exist
    log(`      🔍 Debug: polled ${pollCount}x over ${timeoutSec}s, checking aliases for: ${toEmailLower}`);
  } catch (e) {
    log(`      ⚠️  IMAP error: ${e.message.slice(0, 60)}`);
  } finally {
    try { await client?.logout(); } catch {}
  }
  return null;
}

// ─── Step 8: Verify & create account ───
async function verifyAccount(email, password, code) {
  const { eui, encEmail, encPass } = encryptEUI(email, password);
  const fp = forge.util.bytesToHex(forge.random.getBytesSync(16));
  const body = [
    `ticket=${encodeURIComponent(code)}`, 'region=ID',
    `email=${encodeURIComponent(encEmail)}`, 'env=web', 'qs=%253Fsid%253Dpassport',
    'isAcceptLicense=true', 'sid=', `password=${encodeURIComponent(encPass)}`,
    'policyName=globalmiaccount', 'callback=', `deviceFingerprint=${fp}`
  ].join('&');
  const resp = await proxyFetch('https://global.account.xiaomi.com/pass/verifyEmailRegTicket', {
    method: 'POST',
    headers: {
      'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Origin': 'https://global.account.xiaomi.com', 'Referer': REGISTER_PAGE,
      'X-Requested-With': 'XMLHttpRequest', 'eui': eui
    }, body
  });
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text.replace(/^&&&START&&&/, '')); } catch { data = { raw: text }; }
  // Capture cookies from set-cookie headers (passToken, serviceToken, userId)
  const setCookies = [];
  resp.headers.forEach((val, key) => { if (key === 'set-cookie') setCookies.push(val); });
  for (const c of setCookies) {
    const kv = c.split(';')[0];
    const [name, ...vals] = kv.split('=');
    const value = vals.join('=');
    if (name.trim() === 'passToken') data.passToken = value;
    if (name.trim() === 'serviceToken') data.serviceToken = value;
    if (name.trim() === 'userId') data.userId = data.userId || value;
    if (name.trim() === 'cUserId') data.cUserId = value;
  }
  return data;
}

// ─── Step 9: Apply Referral (Playwright-based) ───
// Must use Playwright because:
// 1. agreement must be accepted before bind
// 2. httpOnly cookies (api-platform_serviceToken) can't be sent via raw HTTP
// 3. credentials: "same-origin" in page.evaluate handles httpOnly cookies automatically
async function applyReferral(passToken, userId) {
  if (!REFERRAL_CODE) return { skipped: true };
  let browser;
  try {
    // Parse proxy for Playwright
    let pwProxy = undefined;
    if (PROXY_URL) {
      try {
        const pu = new URL(PROXY_URL);
        pwProxy = { server: pu.protocol + "//" + pu.hostname + ":" + pu.port, username: pu.username, password: pu.password };
      } catch {}
    }
    browser = await chromium.launch({ headless: true, proxy: pwProxy });

    // Randomized viewport & locale to look more human
    const viewports = [
      { width: 1366, height: 768 }, { width: 1440, height: 900 },
      { width: 1536, height: 864 }, { width: 1920, height: 1080 }
    ];
    const vp = viewports[Math.floor(Math.random() * viewports.length)];
    const context = await browser.newContext({
      viewport: vp, userAgent: UA,
      locale: 'en-US', timezoneId: 'Asia/Jakarta',
    });

    // Set passToken cookies on account.xiaomi.com
    await context.addCookies([
      { name: "passToken", value: passToken, domain: "account.xiaomi.com", path: "/" },
      { name: "userId", value: userId, domain: "account.xiaomi.com", path: "/" },
    ]);

    const page = await context.newPage();
    const humanDelay = () => page.waitForTimeout(2000 + Math.floor(Math.random() * 4000));
    const humanMouse = () => page.mouse.move(
      200 + Math.floor(Math.random() * 600),
      150 + Math.floor(Math.random() * 400)
    );

    // Step 1: SSO login — navigate to console (triggers SSO redirect chain)
    log('      ├─ SSO login → platform console...');
    await page.goto("https://platform.xiaomimimo.com/console", { waitUntil: "networkidle", timeout: 60000 });
    await humanDelay();
    await humanMouse();
    await humanDelay();

    // Step 2: Accept agreement (GET /api/v1/agreement)
    log('      ├─ Accepting agreement...');
    const agrResult = await page.evaluate(async () => {
      const res = await fetch("/api/v1/agreement", {
        method: "GET", credentials: "same-origin",
        headers: { "Accept": "application/json", "x-timeZone": "Asia/Jakarta" }
      });
      return await res.json();
    });
    log('      ├─ Agreement: ' + (agrResult.code === 0 ? '✓' : 'code=' + agrResult.code));
    await humanDelay();

    // Step 3: Refresh session (re-SSO after agreement — session token changes)
    log('      ├─ Refreshing session...');
    await context.addCookies([
      { name: "passToken", value: passToken, domain: "account.xiaomi.com", path: "/" },
      { name: "userId", value: userId, domain: "account.xiaomi.com", path: "/" },
    ]);
    await page.goto("https://platform.xiaomimimo.com/console", { waitUntil: "networkidle", timeout: 60000 });
    await humanDelay();
    await humanMouse();
    await humanDelay();

    // Step 4: Check eligible
    const eligible = await page.evaluate(async () => {
      const res = await fetch("/api/v1/invitation/eligible", {
        credentials: "same-origin",
        headers: { "Accept": "application/json" }
      });
      return await res.json();
    });
    log('      ├─ Eligible: ' + (eligible?.data?.canBind ? '✓' : '✗'));

    if (!eligible?.data?.canBind) {
      log('      └─ ⏭️  Already bound or not eligible');
      await browser.close();
      return { status: 'already_bound' };
    }

    await humanDelay();

    // Step 5: Bind referral via page.evaluate (uses httpOnly cookies automatically)
    log('      ├─ Binding referral: ' + REFERRAL_CODE);
    const bindResult = await page.evaluate(async (code) => {
      const cookies = document.cookie;
      const phMatch = cookies.match(/api-platform_ph="?([^";\s]+)/);
      const ph = phMatch ? phMatch[1].replace(/"/g, "") : "";

      const url = `/api/v1/invitation/bind?api-platform_ph=${encodeURIComponent(ph)}`;
      const res = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ inviteCode: code })
      });
      return { status: res.status, body: await res.text() };
    }, REFERRAL_CODE);

    log('      └─ Bind: ' + (bindResult.status === 200 ? '✓ Success' : '✗ ' + bindResult.status + ' ' + bindResult.body.slice(0, 150)));

    await browser.close();
    return bindResult;
  } catch (e) {
    log('      └─ ❌ Error: ' + e.message);
    if (browser) try { await browser.close(); } catch {}
    return { error: e.message };
  }
}

// ─── Telegram Notifier ───
async function notifyTelegram(email, password, status, ts) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const msg = [
    `✅ *Xiaomi Account Registered*`, ``,
    `📧 Email: \`${email}\``, `🔑 Password: \`${password}\``,
    `🎯 Referral: \`${REFERRAL_CODE}\``, `📊 Status: ${status}`, `🕐 ${ts}`
  ].join('\n');
  try {
    const r = await proxyFetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown' })
    });
    const j = await r.json();
    log(j.ok ? '   📲 Telegram notified' : '   ⚠️  Telegram error: ' + JSON.stringify(j).slice(0, 80));
  } catch (e) { log('   ⚠️  Telegram failed: ' + e.message); }
}

// ─── Email Name Generator ───
const NAME_POOLS = {
  UK: ['james', 'oliver', 'harry', 'george', 'noah', 'jack', 'leo', 'oscar', 'charlie', 'henry',
    'olivia', 'amelia', 'isla', 'ava', 'mia', 'isabella', 'sophia', 'grace', 'lily', 'freddie'],
  US: ['liam', 'noah', 'ethan', 'mason', 'logan', 'james', 'ayden', 'jackson', 'sebastian', 'carter',
    'emma', 'sophia', 'olivia', 'ava', 'isabella', 'mia', 'charlotte', 'amelia', 'harper', 'ella'],
  CN: ['wei', 'jun', 'ming', 'hao', 'chen', 'yang', 'xin', 'yu', 'jie', 'kai',
    'mei', 'ling', 'xue', 'yan', 'li', 'na', 'jing', 'fang', 'hui', 'ping'],
  TW: ['jia', 'ming', 'hao', 'cheng', 'yi', 'jun', 'wei', 'zhe', 'xuan', 'rui',
    'mei', 'ting', 'yu', 'xin', 'jia', 'li', 'wen', 'xuan', 'han', 'chen'],
  SG: ['aaron', 'bryan', 'daniel', 'ethan', 'gabriel', 'ian', 'jason', 'kevin', 'leon', 'marcus',
    'amanda', 'beth', 'claire', 'diana', 'elaine', 'fiona', 'grace', 'hannah', 'irene', 'jane'],
  ID: ['andi', 'budi', 'dika', 'eka', 'fajar', 'gilang', 'hadi', 'ivan', 'joko', 'kurnia',
    'aisyah', 'bella', 'citra', 'dewi', 'eni', 'fitri', 'gita', 'hani', 'indah', 'julia']
};
const REGIONS = Object.keys(NAME_POOLS);

function generateHumanEmail(index) {
  const region = REGIONS[index % REGIONS.length];
  const pool = NAME_POOLS[region];
  const first = pool[Math.floor(Math.random() * pool.length)];
  const last = pool[Math.floor(Math.random() * pool.length)];
  // Various human-like patterns
  const patterns = [
    `${first}.${last}`,
    `${first}${last}`,
    `${first}_${last}`,
    `${first}${Math.floor(Math.random() * 90 + 10)}`,
    `${first}${String.fromCharCode(97 + Math.floor(Math.random() * 26))}${Math.floor(Math.random() * 90 + 10)}`,
    `${first}.${last}${Math.floor(Math.random() * 99 + 1)}`,
  ];
  const local = patterns[Math.floor(Math.random() * patterns.length)].toLowerCase();
  return { email: `${local}@${pickDomain()}`, region };
}

// ─── Register one account ───
async function registerOne(index, totalCount) {
  const ts = new Date().toISOString();
  const { email, region } = generateHumanEmail(index);
  const password = PASSWORD;

  log(``);
  log(`┌─────────────────────────────────────────────────`);
  log(`│ 📧 [${index + 1}/${totalCount}] ${email}  (${region})`);
  log(`└─────────────────────────────────────────────────`);

  const vToken = await getCaptchaToken();
  if (!vToken) { log('   ❌ Captcha failed after 4 attempts'); return { email, password, status: 'FAILED_CAPTCHA', ts }; }

  log('   📧 Sending verification email...');
  const sendResult = await sendVerifyEmail(email, password, vToken);
  if (sendResult.code !== 0) {
    log('   ❌ Send failed: ' + (sendResult.reason || sendResult.desc || 'unknown'));
    return { email, password, status: 'FAILED_SEND: ' + (sendResult.reason || ''), ts };
  }
  log('   ✅ Email sent');

  log('   📬 Waiting for verification code... (120s timeout)');
  const code = await readCode(email, 300);
  if (!code) { log('   ❌ Code timeout — no email received'); return { email, password, status: 'FAILED_CODE_TIMEOUT', ts }; }
  log('   🔑 Code: ' + code);

  log('   🔄 Verifying account...');
  const result = await verifyAccount(email, password, code);
  if (result.code === 0) {
    log('   ✅ Account created successfully!');
    await notifyTelegram(email, password, 'SUCCESS', ts);
    return { email, password, status: 'SUCCESS', referral: REFERRAL_CODE, referralStatus: 'PENDING', ts, passToken: result.passToken || '', serviceToken: result.serviceToken || '', userId: result.userId || result.cUserId || '' };
  }
  log('   ❌ Verify failed: ' + (result.reason || result.desc || 'unknown'));
  return { email, password, status: 'FAILED_VERIFY: ' + (result.reason || ''), ts };
}

// ─── Logger ───
const LOG_LINES = [];
const C = {
  reset: '\x1b[0m', dim: '\x1b[2m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', magenta: '\x1b[35m', white: '\x1b[37m',
  bold: '\x1b[1m', bg_green: '\x1b[42m', bg_red: '\x1b[41m',
};
function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const plain = `[${ts}] ${msg}`;
  // Colorize: green for success markers, red for failures, cyan for info
  let colored = `${C.dim}[${ts}]${C.reset} ${msg}`;
  if (msg.includes('✅') || msg.includes('✓')) colored = `${C.dim}[${ts}]${C.reset} ${C.green}${msg}${C.reset}`;
  else if (msg.includes('❌') || msg.includes('✗')) colored = `${C.dim}[${ts}]${C.reset} ${C.red}${msg}${C.reset}`;
  else if (msg.includes('⚠️')) colored = `${C.dim}[${ts}]${C.reset} ${C.yellow}${msg}${C.reset}`;
  else if (msg.includes('🔄') || msg.includes('🔐') || msg.includes('📧') || msg.includes('📬')) colored = `${C.dim}[${ts}]${C.reset} ${C.cyan}${msg}${C.reset}`;
  console.log(colored);
  LOG_LINES.push(plain);
}

// ─── Main ───
async function main() {
  const count = parseInt(process.argv[2]) || parseInt(COUNT) || 5;
  console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║${C.reset}${C.bold}   XIAOMI BULK REGISTRATION BOT                  ${C.cyan}║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════╝${C.reset}`);
  console.log();
  log(`📋 Config`);
  log(`   Domains  : ${DOMAINS.join(', ')}`);
  log(`   Gmail    : ${GMAIL_USER}`);
  log(`   Referral : ${REFERRAL_CODE || 'none'} (humanized delay)`);
  log(`   Accounts : ${count}`);
  log(`   Proxy    : ${PROXY_URL ? 'enabled' : 'disabled'}`);
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // ── Phase 1: Register all accounts ──
  const results = [];
  for (let i = 0; i < count; i++) {
    try {
      results.push(await registerOne(i, count));
    } catch (e) {
      log('   ❌ EXCEPTION: ' + e.message);
      results.push({ email: `batch_${i}@${pickDomain()}`, password: PASSWORD, status: 'ERROR: ' + e.message, ts: new Date().toISOString() });
    }
    if (i < count - 1) await sleep(3000);
  }

  log(``);
  log(`╔══════════════════════════════════════════════════`);
  log(`║ 📊 REGISTRATION RESULTS`);
  log(`╚══════════════════════════════════════════════════`);
  for (const r of results) {
    const icon = r.status === 'SUCCESS' ? '✅' : '❌';
    log(`   ${icon} ${r.email}`);
    if (r.status !== 'SUCCESS') log(`      └─ ${r.status}`);
  }
  const ok = results.filter(r => r.status === 'SUCCESS').length;
  log(``);
  log(`   📈 Total: ${ok}/${count} success`);

  // ── Phase 2: Deferred referral binding (humanized delays) ──
  const pendingRefs = results.filter(r => r.status === 'SUCCESS' && r.passToken && REFERRAL_CODE);
  if (pendingRefs.length > 0) {
    log(``);
    log(`╔══════════════════════════════════════════════════`);
    log(`║ 🎯 REFERRAL PHASE — ${pendingRefs.length} accounts`);
    log(`║    Humanized delays (3-8min base + jitter)`);
    log(`╚══════════════════════════════════════════════════`);

    let consecutiveFails = 0;
    for (let i = 0; i < pendingRefs.length; i++) {
      const r = pendingRefs[i];

      // Humanized delay: base 3-8min + jitter, longer if consecutive fails
      let baseDelay;
      if (i === 0) {
        baseDelay = 30 + Math.floor(Math.random() * 60); // first one: 30-90s
      } else if (consecutiveFails >= 3) {
        // Cooling off: 10-20min after 3+ consecutive failures
        baseDelay = 600 + Math.floor(Math.random() * 600);
        log(`   🧊 Cooling off after ${consecutiveFails} fails...`);
      } else {
        // Normal: 3-8 min base + random jitter
        baseDelay = 180 + Math.floor(Math.random() * 300) + Math.floor(Math.random() * 120);
      }

      // Every 5th account: take a longer "human break" (8-15min)
      if (i > 0 && i % 5 === 0) {
        const breakTime = 480 + Math.floor(Math.random() * 420);
        log(`   ☕ Human break #${Math.floor(i / 5)} — ${Math.floor(breakTime / 60)}min...`);
        await sleep(breakTime * 1000);
      }

      log(``);
      log(`   🎯 [${i + 1}/${pendingRefs.length}] ${r.email}`);
      log(`   ⏳ Waiting ${Math.floor(baseDelay / 60)}m ${baseDelay % 60}s before bind...`);
      await sleep(baseDelay * 1000);

      // Random "thinking" pause before actual bind (2-8s)
      await sleep(2000 + Math.floor(Math.random() * 6000));

      log(`   🔄 Binding referral ${REFERRAL_CODE}...`);
      try {
        const refResult = await applyReferral(r.passToken, r.userId);
        const bindBody = refResult.body ? JSON.parse(refResult.body) : refResult;
        if (refResult.status === 200 || bindBody?.code === 0) {
          r.referralStatus = 'SUCCESS';
          consecutiveFails = 0;
          log('   ✅ Referral bound successfully!');
        } else {
          r.referralStatus = `FAILED: ${refResult.status || ''} ${bindBody?.code || ''}`;
          consecutiveFails++;
          log('   ❌ Referral failed: ' + JSON.stringify(bindBody).slice(0, 120));
        }
      } catch (e) {
        r.referralStatus = 'ERROR: ' + e.message;
        consecutiveFails++;
        log('   ❌ Referral error: ' + e.message);
      }
    }

    log(``);
    log(`┌─────────────────────────────────────────────────`);
    log(`│ 🎯 REFERRAL RESULTS`);
    log(`└─────────────────────────────────────────────────`);
    for (const r of pendingRefs) {
      const icon = r.referralStatus === 'SUCCESS' ? '✅' : '❌';
      log(`   ${icon} ${r.email} — ${r.referralStatus}`);
    }
  }

  log(``);
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  log(`💾 Saving results...`);

  const fs = await import('node:fs');
  fs.writeFileSync(resolve(__dirname, 'results.json'), JSON.stringify(results, null, 2));
  log(`   ├─ results.json`);

  // Append successful accounts to success.json (accumulative across runs)
  const successPath = resolve(__dirname, 'success.json');
  let existingSuccess = [];
  try { existingSuccess = JSON.parse(fs.readFileSync(successPath, 'utf8')); } catch {}
  const newSuccess = results.filter(r => r.status === 'SUCCESS');
  if (newSuccess.length > 0) {
    existingSuccess.push(...newSuccess);
    fs.writeFileSync(successPath, JSON.stringify(existingSuccess, null, 2));
    log(`   ├─ success.json (+${newSuccess.length}, total: ${existingSuccess.length})`);
  }

  // Save log to logs/ directory
  const logsDir = resolve(__dirname, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const logPath = resolve(logsDir, `${timestamp}.log`);
  fs.writeFileSync(logPath, LOG_LINES.join('\n'));
  log(`   └─ ${logPath}`);
  log(``);
  log(`✨ Done!`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
