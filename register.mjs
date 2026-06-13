#!/usr/bin/env node
/**
 * Xiaomi MiMo Bulk Registration Bot — v2.0 (Chain Referral Edition)
 *
 * Hybrid approach:
 *   - Registration: HTTP-only (fast, no browser overhead)
 *   - Post-reg: Playwright with fingerprint + humanization
 *     (referral binding, invite redemption, API key creation, Ultraspeed form)
 *
 * Chain referral mode: each account's refCode seeds the next iteration.
 *
 * Features ported from mimo-auto-reg (adrapier03):
 *   ✓ Fingerprint noise (canvas/WebGL/audio) for Playwright
 *   ✓ Humanized interactions (per-char typing, hover-before-click)
 *   ✓ Invite code redemption + balance verification
 *   ✓ API key creation per account
 *   ✓ Ultraspeed beta form submission
 *   ✓ Chain referral loop (refCode propagation)
 *   ✓ Capsolver Enterprise captcha solving
 *
 * Usage:
 *   node register.mjs [count]
 *   node register.mjs 5                    # register 5 accounts
 *   node register.mjs 10 --chain           # chain referral mode
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import forge from 'node-forge';
import { chromium } from 'playwright';
import { ImapFlow } from 'imapflow';

// ── Fingerprint & Humanization (from mimo-auto-reg) ──
import { generateFingerprint, buildInitScript, buildExtraHeaders } from './fingerprint.js';
import { humanFill, humanFillLocator, humanClick, humanType, humanDelay } from './human.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env ──
const envPath = resolve(__dirname, '.env');
const envObj = {};
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
  const idx = trimmed.indexOf('=');
  envObj[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
}

const CAPSOLVER_API_KEY = envObj.CAPSOLVER_API_KEY || envObj.TWOCAPTCHA_API_KEY;
const GMAIL_USER = envObj.GMAIL_USER;
const GMAIL_APP_PASSWORD = envObj.GMAIL_APP_PASSWORD;
const DOMAINS = (envObj.DOMAIN || 'batakbersatu.my.id').split(',').map(d => d.trim()).filter(Boolean);
function pickDomain() { return DOMAINS[Math.floor(Math.random() * DOMAINS.length)]; }
const TELEGRAM_BOT_TOKEN = envObj.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = envObj.TELEGRAM_CHAT_ID || '';
const PASSWORD = envObj.PASSWORD || 'Xiaomigey1!';
const COUNT = envObj.COUNT || '5';
const REFERRAL_CODE = envObj.REFERRAL_CODE || 'RJ7ZNA';
const PROXY_URL = envObj.PROXY_URL || '';

// Chain referral mode
const CHAIN_REFERRAL = (envObj.CHAIN_REFERRAL || 'false').toLowerCase() === 'true';
const CHAIN_SEED = envObj.CHAIN_SEED || REFERRAL_CODE;
const ULTRASPEED_FORM = (envObj.ULTRASPEED_FORM || 'false').toLowerCase() === 'true';
const CREATE_API_KEY_FLAG = (envObj.CREATE_API_KEY || 'false').toLowerCase() === 'true';

// CLI flags
const args = process.argv.slice(2);
const chainMode = CHAIN_REFERRAL || args.includes('--chain');
const countArg = args.find(a => !a.startsWith('--'));
const count = parseInt(countArg) || parseInt(COUNT) || 5;

// ── Proxy Setup ──
let proxyAgent = null;
if (PROXY_URL) {
  const { ProxyAgent } = await import('undici');
  proxyAgent = new ProxyAgent({ uri: PROXY_URL });
  console.log('\x1b[36m⚡ Proxy:\x1b[0m ' + PROXY_URL.replace(/:[^:@]+@/, ':***@'));
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

// ── RSA Public Keys ──
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

// ── Fingerprint Payload ──
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

// ── Crypto ──
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

// ── Step 2: Init Captcha ──
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

// ── Step 3: Solve reCAPTCHA (Capsolver) ──
async function createCaptchaTask(eToken) {
  const resp = await (await proxyFetch('https://api.capsolver.com/createTask', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientKey: CAPSOLVER_API_KEY,
      task: {
        type: 'RecaptchaV2EnterpriseTaskProxyless',
        websiteURL: REGISTER_PAGE,
        websiteKey: CAPTCHA_SITE_KEY,
        enterprisePayload: { s: eToken }
      },
      languagePool: 'en'
    })
  })).json();
  if (resp.errorId) throw new Error('capsolver create: ' + resp.errorDescription);
  return resp.taskId;
}

async function pollCaptchaTask(taskId) {
  const poll = await (await proxyFetch('https://api.capsolver.com/getTaskResult', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientKey: CAPSOLVER_API_KEY, taskId })
  })).json();
  return poll;
}

async function solveCaptcha(eToken) {
  const BACKUP_AFTER = 30;
  const POLL_INTERVAL = 3;
  const MAX_WAIT = 180;

  const taskIds = [];
  const firstId = await createCaptchaTask(eToken);
  taskIds.push(firstId);
  log(`      ├─ Task #${firstId} (polling every ${POLL_INTERVAL}s)`);

  let backupSpawned = false;
  const startTime = Date.now();

  for (let i = 0; i < Math.floor(MAX_WAIT / POLL_INTERVAL); i++) {
    await sleep(POLL_INTERVAL * 1000);
    const elapsed = Math.floor((Date.now() - startTime) / 1000);

    if (!backupSpawned && elapsed >= BACKUP_AFTER) {
      try {
        const backupId = await createCaptchaTask(eToken);
        taskIds.push(backupId);
        backupSpawned = true;
        log(`      ├─ ⏱️  ${elapsed}s elapsed — backup task #${backupId} spawned`);
      } catch { /* ignore */ }
    }

    for (let t = taskIds.length - 1; t >= 0; t--) {
      try {
        const poll = await pollCaptchaTask(taskIds[t]);
        if (poll.status === 'ready') {
          log(`      ├─ Solved ✓ (task #${taskIds[t]}, ${elapsed}s)`);
          return poll.solution.gRecaptchaResponse;
        }
        if (poll.errorId && poll.errorCode !== 'CAPCHA_NOT_READY') {
          throw new Error('capsolver poll: ' + poll.errorDescription);
        }
      } catch (e) {
        taskIds.splice(t, 1);
        if (taskIds.length === 0) throw e;
      }
    }
  }
  throw new Error('capsolver timeout');
}

// ── Step 4: Verify captcha → vToken ──
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

// ── Steps 2-4 combined with retry ──
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

// ── Step 6: Send verification email ──
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

// ── Step 7: Read code via IMAP ──
async function readCode(toEmail, timeoutSec = 300) {
  const deadline = Date.now() + timeoutSec * 1000;
  const sentAfter = new Date(Date.now() - 10 * 60 * 1000);
  let client;
  let pollCount = 0;
  const toEmailLower = toEmail.toLowerCase();
  const emailUser = toEmailLower.split('@')[0];

  try {
    client = new ImapFlow({
      host: 'imap.gmail.com', port: 993, secure: true,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
      logger: false, maxConnections: 1, disableAutoIdle: true
    });
    client.on('error', () => {});
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

        if (pollCount === 1 && msgs.length > 0) {
          const aliases = msgs.map(m => m.envelope?.to?.[0]?.address || '?').slice(0, 5);
          log(`      📭 Found ${msgs.length} Xiaomi email(s): ${aliases.join(', ')}${msgs.length > 5 ? '...' : ''}`);
        }

        for (const m of msgs.reverse()) {
          const raw = m.source?.toString('utf8') || '';
          const rawLower = raw.toLowerCase();

          const envelopeTo = (m.envelope?.to || []).map(a => a.address?.toLowerCase()).join(',');
          const rawToHeader = (raw.match(/^To:\s*(.+)/mi)?.[1] || '').toLowerCase();
          const rawDeliveredTo = (raw.match(/^Delivered-To:\s*(.+)/mi)?.[1] || '').toLowerCase();

          const isMatch = envelopeTo.includes(toEmailLower)
            || rawToHeader.includes(toEmailLower)
            || rawDeliveredTo.includes(toEmailLower)
            || rawLower.includes(toEmailLower)
            || rawLower.includes(emailUser);
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

    log(`      🔍 Debug: polled ${pollCount}x over ${timeoutSec}s, checking aliases for: ${toEmailLower}`);
  } catch (e) {
    log(`      ⚠️  IMAP error: ${e.message.slice(0, 60)}`);
  } finally {
    try { await client?.logout(); } catch {}
  }
  return null;
}

// ── Step 8: Verify & create account ──
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

// ══════════════════════════════════════════════════════════════════════════
// PLAYWRIGHT POST-REGISTRATION SESSION
// Handles: SSO login, agreement, invite redemption, referral extraction,
//          API key creation, Ultraspeed form — all with fingerprint + humanization
// ══════════════════════════════════════════════════════════════════════════

class PostRegSession {
  constructor(passToken, userId, inviteCode) {
    this.passToken = passToken;
    this.userId = userId;
    this.inviteCode = inviteCode;
    this.browser = null;
    this.page = null;
    this.context = null;
    this.fingerprint = null;
    this.refCode = null;
    this.apiKey = null;
    this.balance = null;
  }

  async launch() {
    // Generate random fingerprint
    const fp = generateFingerprint();
    this.fingerprint = fp;
    log(`      ├─ 🌐 Browser: Chrome ${fp.chromeMajor}, ${fp.viewport.width}x${fp.viewport.height}`);

    // Parse proxy for Playwright
    let pwProxy = undefined;
    if (PROXY_URL) {
      try {
        const pu = new URL(PROXY_URL);
        pwProxy = { server: pu.protocol + '//' + pu.hostname + ':' + pu.port, username: pu.username, password: pu.password };
      } catch {}
    }

    this.browser = await chromium.launch({
      headless: true,
      proxy: pwProxy,
      args: [
        `--window-size=${fp.viewport.width},${fp.viewport.height}`,
        '--disable-blink-features=AutomationControlled',
      ],
    });

    this.context = await this.browser.newContext({
      userAgent: fp.userAgent,
      viewport: fp.viewport,
      deviceScaleFactor: fp.deviceScaleFactor,
      locale: fp.locale,
      timezoneId: fp.timezone,
      screen: { width: fp.screen.width, height: fp.screen.height },
      extraHTTPHeaders: buildExtraHeaders(fp),
    });

    // Inject fingerprint overrides before page code runs
    await this.context.addInitScript({ content: buildInitScript(fp) });

    // Set passToken cookies
    await this.context.addCookies([
      { name: 'passToken', value: this.passToken, domain: 'account.xiaomi.com', path: '/' },
      { name: 'userId', value: this.userId, domain: 'account.xiaomi.com', path: '/' },
    ]);

    this.page = await this.context.newPage();

    // Suppress console noise
    this.page.on('console', msg => {
      const txt = msg.text();
      if (txt.includes('error') || txt.includes('failed')) {
        log(`      │  [console] ${txt.substring(0, 100)}`);
      }
    });
  }

  async close() {
    if (this.browser) await this.browser.close().catch(() => {});
  }

  // ── SSO Login ──
  async ssoLogin() {
    log(`      ├─ 🔐 SSO login → platform...`);
    await this.page.goto('https://platform.xiaomimimo.com/console', {
      waitUntil: 'networkidle', timeout: 60000
    });
    await humanDelay(1500, 3000);

    // Handle OAuth redirect if needed
    const currentUrl = this.page.url();
    if (currentUrl.includes('account.xiaomi.com') || currentUrl.includes('login') || currentUrl.includes('auth')) {
      log(`      ├─ OAuth redirect detected, authorizing...`);
      await this.page.waitForTimeout(2000);

      const agreeBtn = await this.page.$('button:has-text("Agree"), .miui-modal-wrap button:has-text("Agree")');
      if (agreeBtn) {
        await agreeBtn.click({ force: true });
        await this.page.waitForTimeout(3000);
      }

      const authBtn = await this.page.waitForSelector(
        'button:has-text("Agree"), button:has-text("Authorize"), button:has-text("Sign in"), #accept, .btn-primary',
        { timeout: 10000 }
      ).catch(() => null);
      if (authBtn) {
        await authBtn.click();
        await this.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
        await this.page.waitForTimeout(3000);
      }
    }
    log(`      ├─ ✅ On: ${this.page.url()}`);
  }

  // ── Accept Agreement ──
  async acceptAgreement() {
    log(`      ├─ 📜 Accepting agreement...`);
    const result = await this.page.evaluate(async () => {
      const res = await fetch('/api/v1/agreement', {
        method: 'GET', credentials: 'same-origin',
        headers: { 'Accept': 'application/json', 'x-timeZone': 'Asia/Jakarta' }
      });
      return await res.json();
    });
    log(`      ├─ Agreement: ${result.code === 0 ? '✓' : 'code=' + result.code}`);
    await humanDelay(1000, 2000);
  }

  // ── Handle Terms Modal ──
  async handleTermsModal() {
    try {
      const termsModalOpen = await this.page.evaluate(() => {
        const wraps = Array.from(document.querySelectorAll('.ant-modal-wrap'));
        return wraps.some(wrap => {
          if (wrap.offsetHeight === 0 || wrap.style.display === 'none') return false;
          const text = (wrap.innerText || '').toLowerCase();
          return text.includes('agree') || text.includes('terms');
        });
      });
      if (!termsModalOpen) return;

      log(`      ├─ Terms modal detected, handling...`);
      await this.page.evaluate(() => {
        const modal = Array.from(document.querySelectorAll('.ant-modal-wrap'))
          .find(w => w.offsetHeight > 0 && w.style.display !== 'none');
        if (!modal) return;
        const wrapper = modal.querySelector('.ant-checkbox-wrapper') || modal.querySelector('.ant-checkbox');
        if (wrapper) wrapper.click();
      });
      await this.page.waitForTimeout(800);

      const confirmBtn = await this.page.$('.ant-modal-wrap .ant-btn-primary:not([disabled])');
      if (confirmBtn) {
        await confirmBtn.click({ force: true });
        log(`      ├─ ✓ Terms confirmed`);
      }
      await this.page.waitForTimeout(1000);
    } catch (e) {
      log(`      ├─ ! Terms modal: ${e.message.slice(0, 60)}`);
    }
  }

  // ── Wait for Overlays Gone ──
  async waitForOverlaysGone(timeout = 6000) {
    try {
      await this.page.waitForFunction(() => {
        const masks = document.querySelectorAll('.ant-modal-mask, .ant-modal-wrap');
        return Array.from(masks).every(m => {
          const style = window.getComputedStyle(m);
          return style.display === 'none' || style.visibility === 'hidden' || m.offsetHeight === 0;
        });
      }, { timeout });
    } catch {}
  }

  // ── Redeem Invite Code ──
  async redeemInviteCode() {
    if (!this.inviteCode) return;
    log(`      ├─ 🎁 Redeeming invite code: ${this.inviteCode}`);

    // Navigate to balance page
    await this.page.goto('https://platform.xiaomimimo.com/console/balance', {
      waitUntil: 'networkidle', timeout: 60000
    });
    await this.page.waitForTimeout(2500);

    // Handle redirects
    await this.handleOAuthRedirect();
    await this.acceptCookies();
    await this.handleTermsModal();
    await this.waitForOverlaysGone();

    // Read balance before
    const balanceBefore = await this.readBalance();
    log(`      ├─ 💰 Balance before: $${balanceBefore !== null ? balanceBefore.toFixed(2) : 'unknown'}`);

    // Check if "Enter invite code" exists
    const linkExists = await this.page.evaluate(() =>
      document.body.innerText.includes('Enter invite code')
    ).catch(() => false);

    if (!linkExists) {
      log(`      ├─ ℹ No "Enter invite code" — likely already redeemed`);
      return;
    }

    // Click "Enter invite code"
    try {
      const el = this.page.locator('text=Enter invite code').first();
      await el.waitFor({ state: 'visible', timeout: 8000 });
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await humanDelay(200, 400);
      await el.hover({ timeout: 3000 }).catch(() => {});
      await humanDelay(150, 300);
      await el.click({ timeout: 5000 });
      log(`      ├─ ✓ Clicked "Enter invite code"`);
    } catch (e) {
      // DOM eval fallback
      await this.page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('*'));
        for (let i = elements.length - 1; i >= 0; i--) {
          const el = elements[i];
          const text = (el.textContent || '').trim();
          if (text.includes('Enter invite code') && el.offsetHeight > 0) {
            const tagName = el.tagName.toLowerCase();
            if (['span', 'a', 'button', 'div'].includes(tagName) && el.children.length <= 1) {
              el.scrollIntoView({ block: 'center' });
              el.click();
              return true;
            }
          }
        }
        return false;
      });
    }

    // Wait for modal
    await this.page.waitForSelector('.ant-modal, .ant-modal-wrap', { timeout: 10000 }).catch(() => null);
    await this.page.waitForTimeout(1500);

    // Fill invite code (6-char input boxes or single input)
    const modalInputs = await this.page.$$('.ant-modal input:not([type="checkbox"]), .ant-modal-wrap input:not([type="checkbox"])');
    const visibleInputs = [];
    for (const input of modalInputs) {
      if (await input.isVisible().catch(() => false)) visibleInputs.push(input);
    }

    if (visibleInputs.length >= 6) {
      // 6-box invite code input
      for (const input of visibleInputs) await input.fill('');
      await humanDelay(150, 350);
      await visibleInputs[0].click({ force: true });
      await visibleInputs[0].focus();
      await humanDelay(120, 280);

      for (let i = 0; i < 6; i++) {
        const activeIndex = await this.page.evaluate((els) =>
          els.indexOf(document.activeElement), visibleInputs
        );
        if (activeIndex === i) {
          await this.page.keyboard.type(this.inviteCode[i], { delay: 60 + Math.floor(Math.random() * 120) });
        } else {
          await visibleInputs[i].click({ force: true });
          await visibleInputs[i].focus();
          await humanDelay(80, 180);
          await this.page.keyboard.press('Backspace');
          await this.page.keyboard.type(this.inviteCode[i], { delay: 60 + Math.floor(Math.random() * 120) });
        }
        await humanDelay(180, 380);
      }
      log(`      ├─ ✓ Filled 6-box invite code`);
    } else if (visibleInputs.length > 0) {
      await humanFill(this.page, visibleInputs[0], this.inviteCode);
      log(`      ├─ ✓ Filled invite code (single input)`);
    }

    await this.page.waitForTimeout(1000);

    // Click Redeem button
    const redeemBtn = await this.page.$('.ant-modal button:has-text("Redeem"), button:has-text("Redeem & get")');
    if (redeemBtn) {
      await redeemBtn.click({ force: true });
      log(`      ├─ ✓ Clicked Redeem`);
    } else {
      await this.page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('.ant-modal button'));
        const target = btns.find(b => b.textContent.includes('Redeem') || b.textContent.includes('get $2'));
        if (target) target.click();
      });
    }

    await this.page.waitForTimeout(4000);

    // Check for restriction
    const restrictionMsg = await this.page.evaluate(() => {
      const text = document.body.innerText || '';
      const patterns = [/risk\s*control\s*restriction/i, /account\s+has\s+risk\s+control/i, /contact\s+customer\s+service/i];
      for (const re of patterns) {
        const m = text.match(new RegExp('([^\\n]{0,200}' + re.source + '[^\\n]{0,200})', re.flags));
        if (m) return m[1].trim();
      }
      return null;
    }).catch(() => null);

    if (restrictionMsg) {
      log(`      ├─ ❌ ACCOUNT RESTRICTED: ${restrictionMsg.slice(0, 100)}`);
      return;
    }

    // Close modal & reload for fresh balance
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.page.waitForTimeout(800);
    await this.page.reload({ waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await this.page.waitForTimeout(2000);
    await this.handleTermsModal();
    await this.waitForOverlaysGone();

    const balanceAfter = await this.readBalance();
    log(`      ├─ 💰 Balance after:  $${balanceAfter !== null ? balanceAfter.toFixed(2) : 'unknown'}`);

    if (balanceBefore !== null && balanceAfter !== null) {
      const delta = balanceAfter - balanceBefore;
      if (delta >= 1.5) {
        log(`      ├─ ✅ Balance verified: +$${delta.toFixed(2)}`);
      } else if (delta > 0) {
        log(`      ├─ ⚠ Partial credit: +$${delta.toFixed(2)}`);
      } else {
        log(`      ├─ ❌ Balance did NOT increase`);
      }
    }
    this.balance = balanceAfter;
  }

  // ── Get Referral Code ──
  async getReferralCode() {
    log(`      ├─ 🔗 Fetching referral code...`);

    // Make sure we're on balance page
    if (!this.page.url().includes('/console/balance')) {
      await this.page.goto('https://platform.xiaomimimo.com/console/balance', {
        waitUntil: 'networkidle', timeout: 60000
      }).catch(() => {});
      await this.handleOAuthRedirect();
      await this.handleTermsModal();
      await this.waitForOverlaysGone();
      await humanDelay(1500, 2500);
    }

    // Strategy 1: Scan ?ref= in links/anchors
    let refCode = await this.page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a, [data-href], [data-clipboard-text]'));
      for (const a of anchors) {
        const href = a.href || a.getAttribute('data-href') || a.getAttribute('data-clipboard-text') || '';
        const m = href.match(/[?&]ref=([A-Z0-9]{6})\b/i);
        if (m) return m[1].toUpperCase();
      }
      return null;
    });
    if (this.isValidRefCode(refCode)) {
      log(`      ├─ ✓ Ref code (link): ${refCode}`);
      this.refCode = refCode;
      return refCode;
    }

    // Strategy 2: Page text scan
    refCode = await this.page.evaluate(() => {
      const text = document.body.innerText;
      const m1 = text.match(/[?&]ref=([A-Z0-9]{6})\b/i);
      if (m1) return m1[1].toUpperCase();
      const m2 = text.match(/(?:invite\s+code|referral\s+code|your\s+code)[\s:\n]+([A-Z0-9]{6})\b/i);
      if (m2) return m2[1].toUpperCase();
      return null;
    });
    if (this.isValidRefCode(refCode)) {
      log(`      ├─ ✓ Ref code (text): ${refCode}`);
      this.refCode = refCode;
      return refCode;
    }

    // Strategy 3: Click Refer & earn → modal → scan
    const opened = await this.page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('button, a, [role="button"]'));
      const target = all.find(el => {
        const txt = (el.textContent || '').trim();
        return /^(Refer\s*&\s*earn|Invite|Share)/i.test(txt) && el.offsetHeight > 0;
      });
      if (target) { target.click(); return true; }
      return false;
    });

    if (opened) {
      await this.page.waitForTimeout(2000);
      await humanDelay(800, 1400);

      // Try reading from modal + clipboard
      for (let attempt = 1; attempt <= 3 && !refCode; attempt++) {
        refCode = await this.page.evaluate(() => {
          const modal = Array.from(document.querySelectorAll('.ant-modal, .ant-modal-content, [role="dialog"]'))
            .find(m => m.offsetHeight > 0);
          const scope = modal || document.body;
          const els = Array.from(scope.querySelectorAll('a, [data-clipboard-text], input, textarea'));
          for (const el of els) {
            const sources = [el.href, el.value, el.getAttribute('data-clipboard-text'), el.textContent];
            for (const s of sources) {
              if (!s) continue;
              const m = s.match(/[?&]ref=([A-Z0-9]{6})\b/i);
              if (m) return m[1].toUpperCase();
            }
          }
          const text = scope.innerText || '';
          const m1 = text.match(/[?&]ref=([A-Z0-9]{6})\b/i);
          if (m1) return m1[1].toUpperCase();
          const m2 = text.match(/(?:invite\s+code|referral\s+code)[\s:\n]+([A-Z0-9]{6})\b/i);
          if (m2) return m2[1].toUpperCase();
          return null;
        });
        if (!this.isValidRefCode(refCode)) {
          refCode = null;
          if (attempt < 3) await humanDelay(1200, 1800);
        }
      }

      // Clipboard fallback
      if (!refCode) {
        try {
          const ctx = this.page.context();
          await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
          await this.page.evaluate(() => {
            const modal = Array.from(document.querySelectorAll('.ant-modal, [role="dialog"]'))
              .find(m => m.offsetHeight > 0);
            if (!modal) return;
            const btns = Array.from(modal.querySelectorAll('button'));
            const copy = btns.find(b => /^(copy|copy link)/i.test((b.textContent || '').trim()));
            if (copy) copy.click();
          });
          await humanDelay(900, 1400);
          const clipText = await this.page.evaluate(async () => {
            try { return await navigator.clipboard.readText(); } catch { return ''; }
          });
          if (clipText) {
            const m = clipText.match(/[?&]ref=([A-Z0-9]{6})\b/i);
            if (m && this.isValidRefCode(m[1])) refCode = m[1].toUpperCase();
            else if (this.isValidRefCode(clipText.trim())) refCode = clipText.trim().toUpperCase();
          }
        } catch {}
      }

      await this.page.keyboard.press('Escape').catch(() => {});
    }

    if (this.isValidRefCode(refCode)) {
      log(`      ├─ ✓ Ref code: ${refCode}`);
      this.refCode = refCode;
      return refCode;
    }

    log(`      ├─ ⚠ Ref code not found`);
    return null;
  }

  isValidRefCode(s) {
    if (!s) return false;
    const up = String(s).toUpperCase().trim();
    const blacklist = ['YOUR', 'CODE', 'INVITE', 'REFERRAL', 'ENTER', 'COPY', 'SHARE', 'EARN', 'NULL', 'NONE', 'TRUE', 'FALSE'];
    if (up.length !== 6) return false;
    if (blacklist.includes(up)) return false;
    return /^[A-Z0-9]{6}$/.test(up);
  }

  // ── Read Balance ──
  async readBalance() {
    try {
      return await this.page.evaluate(() => {
        const text = document.body.innerText || '';
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length - 1; i++) {
          if (/^balance$/i.test(lines[i].trim())) {
            for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
              const m = lines[j].match(/\$\s*([0-9]+\.[0-9]{2})/);
              if (m) return parseFloat(m[1]);
            }
          }
        }
        const bonus = text.match(/bonus\s+balance\s*[:\s]\s*\$\s*([0-9]+\.[0-9]{2})/i);
        const cash = text.match(/cash\s+balance\s*[:\s]\s*\$\s*([0-9]+\.[0-9]{2})/i);
        if (bonus && cash) return parseFloat(bonus[1]) + parseFloat(cash[1]);
        if (bonus) return parseFloat(bonus[1]);
        return null;
      });
    } catch { return null; }
  }

  // ── Create API Key ──
  async createApiKey() {
    log(`      ├─ 🔑 Creating API key...`);
    await this.page.goto('https://platform.xiaomimimo.com/console/api-keys', {
      waitUntil: 'networkidle', timeout: 60000
    });
    await this.page.waitForTimeout(4000);
    await this.handleOAuthRedirect();
    await this.handleTermsModal();
    await this.waitForOverlaysGone();

    // Check existing key
    const existing = await this.page.evaluate(() => {
      const text = document.body.innerText;
      const m = text.match(/sk-[a-zA-Z0-9_\-]{6,}(?:\.{3}[a-zA-Z0-9_\-]{3,})?/);
      return m ? m[0] : null;
    }).catch(() => null);

    if (existing) {
      log(`      ├─ ℹ Existing API key: ${existing}`);
      this.apiKey = existing;
      return existing;
    }

    // Click Create API Key
    const createBtn = await this.page.$('button:has-text("Create API Key")');
    if (createBtn) {
      await createBtn.click({ force: true });
    } else {
      await this.page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Create API Key'));
        if (btn) btn.click();
      });
    }
    await this.page.waitForTimeout(2000);

    // Fill name
    const nameInput = await this.page.waitForSelector('.ant-modal input[placeholder="Please enter"], .ant-modal-body input', { timeout: 5000 }).catch(() => null);
    if (nameInput) {
      await humanFill(this.page, nameInput, 'mykey');
    }
    await humanDelay(250, 500);

    // Confirm
    const confirmBtn = await this.page.$('.ant-modal-footer button.ant-btn-primary, .ant-modal button:has-text("Confirm")');
    if (confirmBtn) await confirmBtn.click({ force: true });
    await this.page.waitForTimeout(4000);

    // Extract key
    const apiKey = await this.page.evaluate(() => {
      const modals = Array.from(document.querySelectorAll('.ant-modal-wrap, .ant-modal, .ant-notification'));
      for (const modal of modals) {
        const m = (modal.innerText || '').match(/sk-[a-zA-Z0-9_\-]+/);
        if (m) return m[0];
      }
      const bodyMatch = document.body.innerText.match(/sk-[a-zA-Z0-9_\-]+/);
      return bodyMatch ? bodyMatch[0] : null;
    });

    if (apiKey) {
      log(`      ├─ ✓ API key: ${apiKey}`);
      this.apiKey = apiKey;
    } else {
      log(`      ├─ ⚠ Failed to extract API key`);
    }

    // Close modal
    const closeBtn = await this.page.$('.ant-modal-wrap button:has-text("OK"), .ant-modal-wrap button:has-text("Close")');
    if (closeBtn) await closeBtn.click().catch(() => {});
    else await this.page.keyboard.press('Escape').catch(() => {});
    await this.page.waitForTimeout(1000);

    return apiKey;
  }

  // ── Fill Ultraspeed Form ──
  async fillUltraspeedForm(email) {
    log(`      ├─ ⚡ Filling Ultraspeed beta form...`);
    await this.page.goto('https://platform.xiaomimimo.com/ultraspeed', {
      waitUntil: 'networkidle', timeout: 60000
    });
    await this.page.waitForTimeout(5000);
    await this.handleOAuthRedirect();
    await this.acceptCookies();
    await this.handleTermsModal();
    await this.waitForOverlaysGone();

    // Generate random data
    const firstNames = ['Adit', 'Bintang', 'Rian', 'Bayu', 'Dedi', 'Dimas', 'Eko', 'Fajar', 'Gilang', 'Heri', 'Agus', 'Budi'];
    const lastNames = ['Nugraha', 'Wira', 'Saputra', 'Pratama', 'Hidayat', 'Kurniawan', 'Santoso', 'Wijaya'];
    const randomName = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
    const randomPhone = '812' + Math.floor(10000000 + Math.random() * 90000000);

    const fillByLabel = async (labelText, value, inputSelector = 'input') => {
      try {
        const formItem = this.page.locator('.ant-form-item').filter({ hasText: new RegExp(`^${labelText}`) });
        if (await formItem.count() > 0) {
          const input = formItem.first().locator(inputSelector);
          if (await input.count() > 0) {
            await input.first().fill(value);
            await this.page.waitForTimeout(150);
            return true;
          }
        }
      } catch {}
      return false;
    };

    await this.page.waitForSelector('.ant-form-item', { timeout: 10000 });
    await this.page.waitForTimeout(1000);

    // Fill fields
    await fillByLabel('Your name', randomName);
    await fillByLabel('Email', email);
    await fillByLabel('Company name', 'SignalStack');

    // Phone prefix
    try {
      const selector = this.page.locator('.ant-form-item').filter({ hasText: /^Phone number/ }).locator('.ant-select-selector, .ant-dropdown-trigger');
      if (await selector.count() > 0) {
        await selector.first().click({ force: true });
        await this.page.waitForTimeout(1500);
        await this.page.evaluate(() => {
          const dropdowns = Array.from(document.querySelectorAll('.ant-select-dropdown, .ant-dropdown')).filter(el => el.offsetHeight > 0);
          if (dropdowns.length > 0) {
            const opts = Array.from(dropdowns[dropdowns.length - 1].querySelectorAll('.ant-select-item-option, li'));
            const target = opts.find(o => (o.textContent || '').includes('+62'));
            if (target) target.click();
          }
        });
        await this.page.waitForTimeout(1000);
      }
      const phoneInput = this.page.locator('.ant-form-item').filter({ hasText: /^Phone number/ }).locator('input[placeholder="Please enter"]');
      if (await phoneInput.count() > 0) await phoneInput.first().fill(randomPhone);
    } catch {}

    // Dropdowns
    const selectDropdown = async (labelText, searchText) => {
      try {
        const formItem = this.page.locator('.ant-form-item').filter({ hasText: new RegExp(`^${labelText}`) });
        const selector = formItem.first().locator('.ant-select-selector');
        await selector.click({ force: true });
        await this.page.waitForTimeout(1500);
        await this.page.evaluate((search) => {
          const dropdowns = Array.from(document.querySelectorAll('.ant-select-dropdown')).filter(el => el.offsetHeight > 0);
          if (dropdowns.length > 0) {
            const opts = Array.from(dropdowns[dropdowns.length - 1].querySelectorAll('.ant-select-item-option'));
            const target = opts.find(o => (o.textContent || '').trim() === search || (o.textContent || '').includes(search));
            if (target) target.click();
          }
        }, searchText);
        await this.page.waitForTimeout(1000);
      } catch {}
    };

    await selectDropdown('Industry', 'Finance');
    await selectDropdown('Your use case', 'Latency-critical');

    // Textarea
    const shareText = `Building automated trading systems that need to process market data and execute decisions in milliseconds. We use LLMs for risk assessment, sentiment analysis on news feeds, and generating trade rationale in real time. Exploring MiMo UltraSpeed for latency-critical inference. Running about 40k calls daily.`;
    try {
      const textarea = this.page.locator('textarea').first();
      if (await textarea.count() > 0) await textarea.fill(shareText);
    } catch {}

    await this.page.waitForTimeout(1000);

    // Submit
    await this.page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
      const submit = btns.find(b => (b.textContent || '').includes('Submit'));
      if (submit) {
        submit.scrollIntoView({ block: 'center' });
        submit.click();
      }
    });

    // Handle "Got it" confirmation
    const gotItBtn = await this.page.waitForSelector('button:has-text("Got it")', { timeout: 6000 }).catch(() => null);
    if (gotItBtn) {
      await gotItBtn.click({ force: true });
      await this.page.waitForTimeout(5000);
    }

    log(`      ├─ ✓ Ultraspeed form submitted`);
  }

  // ── Helper: Handle OAuth Redirect ──
  async handleOAuthRedirect() {
    const currentUrl = this.page.url();
    if (currentUrl.includes('account.xiaomi.com') || currentUrl.includes('login') || currentUrl.includes('auth')) {
      log(`      ├─ OAuth redirect detected...`);
      await this.page.waitForTimeout(2000);
      const agreeBtn = await this.page.$('button:has-text("Agree")');
      if (agreeBtn) {
        await agreeBtn.click({ force: true });
        await this.page.waitForTimeout(3000);
      }
      const authBtn = await this.page.waitForSelector(
        'button:has-text("Agree"), button:has-text("Authorize"), #accept', { timeout: 10000 }
      ).catch(() => null);
      if (authBtn) {
        await authBtn.click();
        await this.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
        await this.page.waitForTimeout(3000);
      }
    }
  }

  // ── Helper: Accept Cookies ──
  async acceptCookies() {
    const btn = await this.page.waitForSelector('button:has-text("Accept All"), button:has-text("Accept")', { timeout: 4000 }).catch(() => null);
    if (btn) {
      await btn.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(2000);
    }
  }

  // ── Run all post-reg steps ──
  async run(email) {
    try {
      await this.launch();

      // 1. SSO login
      await this.ssoLogin();
      await humanDelay(2000, 4000);

      // 2. Accept agreement
      await this.acceptAgreement();
      await humanDelay(1000, 2000);

      // 3. Refresh session
      await this.context.addCookies([
        { name: 'passToken', value: this.passToken, domain: 'account.xiaomi.com', path: '/' },
        { name: 'userId', value: this.userId, domain: 'account.xiaomi.com', path: '/' },
      ]);
      await this.page.goto('https://platform.xiaomimimo.com/console', {
        waitUntil: 'networkidle', timeout: 60000
      });
      await humanDelay(2000, 4000);

      // 4. Redeem invite code
      try {
        await this.redeemInviteCode();
      } catch (e) {
        log(`      ├─ ! Redeem error: ${e.message.slice(0, 80)}`);
      }

      // 5. Get referral code (for chain)
      try {
        await this.getReferralCode();
      } catch (e) {
        log(`      ├─ ! getRefCode error: ${e.message.slice(0, 80)}`);
      }

      // 6. Create API key
      if (CREATE_API_KEY_FLAG) {
        try {
          await this.createApiKey();
        } catch (e) {
          log(`      ├─ ! createApiKey error: ${e.message.slice(0, 80)}`);
        }
      }

      // 7. Ultraspeed form
      if (ULTRASPEED_FORM) {
        try {
          await this.fillUltraspeedForm(email);
        } catch (e) {
          log(`      ├─ ! Ultraspeed error: ${e.message.slice(0, 80)}`);
        }
      }

      return {
        refCode: this.refCode,
        apiKey: this.apiKey,
        balance: this.balance,
      };
    } catch (e) {
      log(`      └─ ❌ Post-reg error: ${e.message}`);
      return { refCode: null, apiKey: null, balance: null, error: e.message };
    } finally {
      await this.close();
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// TELEGRAM NOTIFIER
// ══════════════════════════════════════════════════════════════════════════

async function notifyTelegram(email, password, status, ts, extra = {}) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const lines = [
    `✅ *Xiaomi Account Registered*`, ``,
    `📧 Email: \`${email}\``, `🔑 Password: \`${password}\``,
    `🎯 Referral: \`${extra.inviteCode || REFERRAL_CODE}\``,
    `📊 Status: ${status}`, `🕐 ${ts}`,
  ];
  if (extra.refCode) lines.push(`🔗 RefCode: \`${extra.refCode}\``);
  if (extra.apiKey) lines.push(`🔑 API Key: \`${extra.apiKey}\``);
  if (extra.balance !== null && extra.balance !== undefined) lines.push(`💰 Balance: $${extra.balance.toFixed(2)}`);
  try {
    const r = await proxyFetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: lines.join('\n'), parse_mode: 'Markdown' })
    });
    const j = await r.json();
    log(j.ok ? '   📲 Telegram notified' : '   ⚠️  Telegram error: ' + JSON.stringify(j).slice(0, 80));
  } catch (e) { log('   ⚠️  Telegram failed: ' + e.message); }
}

// ══════════════════════════════════════════════════════════════════════════
// EMAIL NAME GENERATOR
// ══════════════════════════════════════════════════════════════════════════

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
    'aisyah', 'bella', 'citra', 'dewi', 'eni', 'fitri', 'gita', 'hani', 'indah', 'julia'],
};
const REGIONS = Object.keys(NAME_POOLS);

function generateHumanEmail(index) {
  const region = REGIONS[index % REGIONS.length];
  const pool = NAME_POOLS[region];
  const first = pool[Math.floor(Math.random() * pool.length)];
  const last = pool[Math.floor(Math.random() * pool.length)];
  const patterns = [
    `${first}.${last}`, `${first}${last}`, `${first}_${last}`,
    `${first}${Math.floor(Math.random() * 90 + 10)}`,
    `${first}${String.fromCharCode(97 + Math.floor(Math.random() * 26))}${Math.floor(Math.random() * 90 + 10)}`,
    `${first}.${last}${Math.floor(Math.random() * 99 + 1)}`,
  ];
  const local = patterns[Math.floor(Math.random() * patterns.length)].toLowerCase();
  return { email: `${local}@${pickDomain()}`, region };
}

// ══════════════════════════════════════════════════════════════════════════
// REGISTER ONE ACCOUNT (HTTP registration + Playwright post-reg)
// ══════════════════════════════════════════════════════════════════════════

async function registerOne(index, totalCount, inviteCode) {
  const ts = new Date().toISOString();
  const { email, region } = generateHumanEmail(index);
  const password = PASSWORD;

  log(``);
  log(`┌─────────────────────────────────────────────────`);
  log(`│ 📧 [${index + 1}/${totalCount}] ${email}  (${region})`);
  if (chainMode) log(`│ 🔗 Invite code: ${inviteCode}`);
  log(`└─────────────────────────────────────────────────`);

  // ── Phase A: HTTP Registration ──
  const vToken = await getCaptchaToken();
  if (!vToken) { log('   ❌ Captcha failed after 4 attempts'); return { email, password, status: 'FAILED_CAPTCHA', ts }; }

  log('   📧 Sending verification email...');
  const sendResult = await sendVerifyEmail(email, password, vToken);
  if (sendResult.code !== 0) {
    log('   ❌ Send failed: ' + (sendResult.reason || sendResult.desc || 'unknown'));
    return { email, password, status: 'FAILED_SEND: ' + (sendResult.reason || ''), ts };
  }
  log('   ✅ Email sent');

  log('   📬 Waiting for verification code... (300s timeout)');
  const code = await readCode(email, 300);
  if (!code) { log('   ❌ Code timeout — no email received'); return { email, password, status: 'FAILED_CODE_TIMEOUT', ts }; }
  log('   🔑 Code: ' + code);

  log('   🔄 Verifying account...');
  const result = await verifyAccount(email, password, code);
  if (result.code !== 0) {
    log('   ❌ Verify failed: ' + (result.reason || result.desc || 'unknown'));
    return { email, password, status: 'FAILED_VERIFY: ' + (result.reason || ''), ts };
  }
  log('   ✅ Account created!');

  const passToken = result.passToken || '';
  const userId = result.userId || result.cUserId || '';

  // ── Phase B: Playwright Post-Registration ──
  let postRegResult = { refCode: null, apiKey: null, balance: null };
  if (passToken) {
    log('   🌐 Post-registration session...');
    const session = new PostRegSession(passToken, userId, inviteCode);
    postRegResult = await session.run(email);
  }

  await notifyTelegram(email, password, 'SUCCESS', ts, {
    inviteCode, refCode: postRegResult.refCode, apiKey: postRegResult.apiKey, balance: postRegResult.balance
  });

  return {
    email, password, status: 'SUCCESS',
    referral: inviteCode, ts, passToken, serviceToken: result.serviceToken || '',
    userId, refCode: postRegResult.refCode, apiKey: postRegResult.apiKey, balance: postRegResult.balance,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// LOGGER
// ══════════════════════════════════════════════════════════════════════════

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
  let colored = `${C.dim}[${ts}]${C.reset} ${msg}`;
  if (msg.includes('✅') || msg.includes('✓')) colored = `${C.dim}[${ts}]${C.reset} ${C.green}${msg}${C.reset}`;
  else if (msg.includes('❌') || msg.includes('✗')) colored = `${C.dim}[${ts}]${C.reset} ${C.red}${msg}${C.reset}`;
  else if (msg.includes('⚠️') || msg.includes('⚠')) colored = `${C.dim}[${ts}]${C.reset} ${C.yellow}${msg}${C.reset}`;
  else if (msg.includes('🔄') || msg.includes('🔐') || msg.includes('📧') || msg.includes('📬') || msg.includes('🌐')) colored = `${C.dim}[${ts}]${C.reset} ${C.cyan}${msg}${C.reset}`;
  console.log(colored);
  LOG_LINES.push(plain);
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║${C.reset}${C.bold}   XIAOMI BULK REGISTRATION BOT v2.0             ${C.cyan}║${C.reset}`);
  console.log(`${C.bold}${C.cyan}║${C.reset}   Chain Referral + API Key + Ultraspeed          ${C.cyan}║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════╝${C.reset}`);
  console.log();
  log(`📋 Config`);
  log(`   Domains     : ${DOMAINS.join(', ')}`);
  log(`   Gmail       : ${GMAIL_USER}`);
  log(`   Accounts    : ${count}`);
  log(`   Chain mode  : ${chainMode ? '✅ ON' : '❌ OFF'}`);
  if (chainMode) log(`   Seed invite : ${CHAIN_SEED}`);
  log(`   API key     : ${CREATE_API_KEY_FLAG ? '✅ ON' : '❌ OFF'}`);
  log(`   Ultraspeed  : ${ULTRASPEED_FORM ? '✅ ON' : '❌ OFF'}`);
  log(`   Proxy       : ${PROXY_URL ? 'enabled' : 'disabled'}`);
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const results = [];
  let currentInviteCode = chainMode ? CHAIN_SEED : REFERRAL_CODE;

  for (let i = 0; i < count; i++) {
    try {
      const result = await registerOne(i, count, currentInviteCode);
      results.push(result);

      // Chain: pass refCode to next iteration
      if (chainMode && result.status === 'SUCCESS' && result.refCode) {
        log(`\n   🔗 Chain: next iteration will use refCode ${result.refCode}`);
        currentInviteCode = result.refCode;
      } else if (chainMode && result.status === 'SUCCESS' && !result.refCode) {
        log(`\n   ⚠️  Chain broken: no refCode captured. Using same invite code.`);
      }
    } catch (e) {
      log('   ❌ EXCEPTION: ' + e.message);
      results.push({ email: `batch_${i}@${pickDomain()}`, password: PASSWORD, status: 'ERROR: ' + e.message, ts: new Date().toISOString() });
    }
    if (i < count - 1) await sleep(3000);
  }

  // ── Results Summary ──
  log(``);
  log(`╔══════════════════════════════════════════════════`);
  log(`║ 📊 RESULTS`);
  log(`╚══════════════════════════════════════════════════`);
  for (const r of results) {
    const icon = r.status === 'SUCCESS' ? '✅' : '❌';
    log(`   ${icon} ${r.email}${r.refCode ? ` → ref:${r.refCode}` : ''}${r.apiKey ? ` key:${r.apiKey.slice(0, 12)}...` : ''}`);
    if (r.status !== 'SUCCESS') log(`      └─ ${r.status}`);
  }
  const ok = results.filter(r => r.status === 'SUCCESS').length;
  log(``);
  log(`   📈 Total: ${ok}/${count} success`);

  // ── Save Results ──
  log(``);
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  log(`💾 Saving results...`);

  const fs = await import('node:fs');
  fs.writeFileSync(resolve(__dirname, 'results.json'), JSON.stringify(results, null, 2));
  log(`   ├─ results.json`);

  const successPath = resolve(__dirname, 'success.json');
  let existingSuccess = [];
  try { existingSuccess = JSON.parse(fs.readFileSync(successPath, 'utf8')); } catch {}
  const newSuccess = results.filter(r => r.status === 'SUCCESS');
  if (newSuccess.length > 0) {
    existingSuccess.push(...newSuccess);
    fs.writeFileSync(successPath, JSON.stringify(existingSuccess, null, 2));
    log(`   ├─ success.json (+${newSuccess.length}, total: ${existingSuccess.length})`);
  }

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
