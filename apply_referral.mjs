/**
 * Standalone Referral Applicator
 * Reads success.json and applies referral to accounts with PENDING/FAILED status.
 * Usage: node apply_referral.mjs [delay_seconds]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import forge from 'node-forge';
import { chromium } from 'playwright';

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

const REFERRAL_CODE = envObj.REFERRAL_CODE || 'CLAYQ4';
const REFERRAL_DELAY = parseInt(process.argv[2]) || parseInt(envObj.REFERRAL_DELAY) || 120;
const PROXY_URL = envObj.PROXY_URL || '';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function applyReferral(passToken, userId) {
  let browser;
  try {
    let pwProxy = undefined;
    if (PROXY_URL) {
      try {
        const pu = new URL(PROXY_URL);
        pwProxy = { server: pu.protocol + "//" + pu.hostname + ":" + pu.port, username: pu.username, password: pu.password };
      } catch {}
    }
    browser = await chromium.launch({ headless: true, proxy: pwProxy });

    const viewports = [
      { width: 1366, height: 768 }, { width: 1440, height: 900 },
      { width: 1536, height: 864 }, { width: 1920, height: 1080 }
    ];
    const vp = viewports[Math.floor(Math.random() * viewports.length)];
    const context = await browser.newContext({
      viewport: vp, userAgent: UA,
      locale: 'en-US', timezoneId: 'Asia/Jakarta',
    });

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

    log('    SSO login → platform console...');
    await page.goto("https://platform.xiaomimimo.com/console", { waitUntil: "networkidle", timeout: 60000 });
    await humanDelay();
    await humanMouse();
    await humanDelay();

    log('    Accepting agreement...');
    const agrResult = await page.evaluate(async () => {
      const res = await fetch("/api/v1/agreement", {
        method: "GET", credentials: "same-origin",
        headers: { "Accept": "application/json", "x-timeZone": "Asia/Jakarta" }
      });
      return await res.json();
    });
    log('    agreement: code=' + agrResult.code);
    await humanDelay();

    log('    Refreshing session...');
    await context.addCookies([
      { name: "passToken", value: passToken, domain: "account.xiaomi.com", path: "/" },
      { name: "userId", value: userId, domain: "account.xiaomi.com", path: "/" },
    ]);
    await page.goto("https://platform.xiaomimimo.com/console", { waitUntil: "networkidle", timeout: 60000 });
    await humanDelay();
    await humanMouse();
    await humanDelay();

    const eligible = await page.evaluate(async () => {
      const res = await fetch("/api/v1/invitation/eligible", {
        credentials: "same-origin",
        headers: { "Accept": "application/json" }
      });
      return await res.json();
    });
    log('    eligible: canBind=' + eligible?.data?.canBind);

    if (!eligible?.data?.canBind) {
      await browser.close();
      return { status: 'already_bound' };
    }

    await humanDelay();

    log('    Binding referral: ' + REFERRAL_CODE);
    const bindResult = await page.evaluate(async (code) => {
      const cookies = document.cookie;
      const phMatch = cookies.match(/api-platform_ph="?([^";\s]+)/);
      const ph = phMatch ? phMatch[1].replace(/"/g, "") : "";
      const url = `/api/v1/invitation/bind?api-platform_ph=${encodeURIComponent(ph)}`;
      const res = await fetch(url, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ inviteCode: code })
      });
      return { status: res.status, body: await res.text() };
    }, REFERRAL_CODE);

    log('    bind: ' + bindResult.status + ' ' + bindResult.body.slice(0, 200));
    await browser.close();
    return bindResult;
  } catch (e) {
    log('    err: ' + e.message);
    if (browser) try { await browser.close(); } catch {}
    return { error: e.message };
  }
}

async function main() {
  const successPath = resolve(__dirname, 'success.json');
  let results;
  try {
    results = JSON.parse(readFileSync(successPath, 'utf8'));
  } catch (e) {
    log('ERROR: Cannot read success.json — ' + e.message);
    process.exit(1);
  }

  // Filter accounts that need referral (PENDING, FAILED, or no referralStatus)
  const pending = results.filter(r =>
    r.status === 'SUCCESS' && r.passToken &&
    (!r.referralStatus || r.referralStatus === 'PENDING' || r.referralStatus.startsWith('FAILED'))
  );

  if (pending.length === 0) {
    log('No accounts need referral binding. All done!');
    return;
  }

  log(`Referral Applicator — ${pending.length} accounts`);
  log(`Code: ${REFERRAL_CODE} | Delay: ${REFERRAL_DELAY}s + jitter`);
  log('-'.repeat(50));

  for (let i = 0; i < pending.length; i++) {
    const r = pending[i];
    const delay = i === 0 ? 5 : REFERRAL_DELAY + Math.floor(Math.random() * 60);
    log(`\n[${i + 1}/${pending.length}] ${r.email}`);
    if (i > 0) {
      log(`  waiting ${delay}s...`);
      await sleep(delay * 1000);
    }
    log('  applying referral...');

    try {
      const refResult = await applyReferral(r.passToken, r.userId);
      const bindBody = refResult.body ? JSON.parse(refResult.body) : refResult;
      if (refResult.status === 200 || bindBody?.code === 0) {
        r.referralStatus = 'SUCCESS';
        log('  ✅ referral SUCCESS');
      } else if (refResult.status === 'already_bound') {
        r.referralStatus = 'ALREADY_BOUND';
        log('  ⏭️  already bound');
      } else {
        r.referralStatus = `FAILED: ${refResult.status || ''} ${bindBody?.code || ''}`;
        log('  ❌ referral FAILED: ' + JSON.stringify(bindBody).slice(0, 120));
      }
    } catch (e) {
      r.referralStatus = 'ERROR: ' + e.message;
      log('  ❌ ERROR: ' + e.message);
    }

    // Save after each attempt (in case of crash)
    writeFileSync(successPath, JSON.stringify(results, null, 2));
  }

  log('\n' + '='.repeat(50));
  log('RESULTS:');
  for (const r of pending) {
    const icon = r.referralStatus === 'SUCCESS' ? '✅' : r.referralStatus === 'ALREADY_BOUND' ? '⏭️' : '❌';
    log(`  ${icon} ${r.email} — ${r.referralStatus}`);
  }
  log('Saved: success.json');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
