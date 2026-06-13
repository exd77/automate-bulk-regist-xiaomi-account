/**
 * Browser fingerprint randomizer for Playwright.
 *
 * generateFingerprint() -> profile object
 * buildInitScript(fp)   -> JS string yang di-inject ke setiap halaman
 *                          via context.addInitScript() biar override jalan
 *                          sebelum kode situs sempat baca navigator/screen/canvas.
 *
 * Catatan: ini ngacak permukaan-permukaan yang dibaca skrip anti-bot umum
 * (FingerprintJS, Akamai BMP, dsb). Bukan stealth penuh — kalau target
 * pasang deteksi level network (TLS JA3, IP, ASN), butuh proxy + tools lain.
 */

import crypto from 'crypto';

// ---- Pool data ----------------------------------------------------------

const CHROME_VERSIONS = [
  '122.0.0.0', '123.0.0.0', '124.0.0.0', '125.0.0.0', '126.0.0.0',
  '127.0.0.0', '128.0.0.0', '129.0.0.0', '130.0.0.0', '131.0.0.0',
];

// Windows 10 dan 11 dua-duanya report "10.0" di UA string
const WINDOWS_NT_VERSION = '10.0';

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1600, height: 900 },
  { width: 1680, height: 1050 },
  { width: 1280, height: 720 },
  { width: 1280, height: 800 },
];

const LOCALES = ['en-US', 'en-GB', 'id-ID', 'en-AU', 'en-CA', 'en-SG'];

const TIMEZONES = [
  'Asia/Jakarta', 'Asia/Singapore', 'Asia/Bangkok',
  'Asia/Kuala_Lumpur', 'Asia/Manila', 'Asia/Ho_Chi_Minh',
];

const HARDWARE_CONCURRENCY = [4, 6, 8, 12, 16];
const DEVICE_MEMORY = [4, 8, 16];
const COLOR_DEPTHS = [24, 30];

// Pasangan vendor + renderer realistis (gak campur — kalau vendor NVIDIA,
// renderer-nya juga GPU NVIDIA biar konsisten saat skrip cocokkan keduanya)
const WEBGL_RENDERERS = [
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Intel)',  renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Intel)',  renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Intel)',  renderer: 'ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (AMD)',    renderer: 'ANGLE (AMD, AMD Radeon RX 6600 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (AMD)',    renderer: 'ANGLE (AMD, AMD Radeon Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' },
];

// ---- Helpers ------------------------------------------------------------

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---- Fingerprint generator ---------------------------------------------

export function generateFingerprint() {
  const chromeVersion = pick(CHROME_VERSIONS);
  const chromeMajor = chromeVersion.split('.')[0];
  const viewport = pick(VIEWPORTS);
  const locale = pick(LOCALES);
  const timezone = pick(TIMEZONES);
  const cores = pick(HARDWARE_CONCURRENCY);
  const memory = pick(DEVICE_MEMORY);
  const webgl = pick(WEBGL_RENDERERS);
  const colorDepth = pick(COLOR_DEPTHS);
  const deviceScaleFactor = pick([1, 1, 1, 1.25, 1.5]);

  const userAgent =
    `Mozilla/5.0 (Windows NT ${WINDOWS_NT_VERSION}; Win64; x64) ` +
    `AppleWebKit/537.36 (KHTML, like Gecko) ` +
    `Chrome/${chromeVersion} Safari/537.36`;

  // Screen biasanya >= viewport. Kasih taskbar offset acak.
  const screenWidth = viewport.width;
  const screenHeight = viewport.height + randInt(40, 120);
  const availHeight = screenHeight - randInt(30, 60);

  // Seed unik buat noise canvas / audio
  const seed = crypto.randomBytes(16).toString('hex');

  return {
    userAgent,
    chromeMajor,
    chromeVersion,
    viewport,
    deviceScaleFactor,
    screen: {
      width: screenWidth,
      height: screenHeight,
      availWidth: screenWidth,
      availHeight,
      colorDepth,
    },
    locale,
    timezone,
    platform: 'Win32',
    hardwareConcurrency: cores,
    deviceMemory: memory,
    webgl,
    seed,
    pluginsCount: randInt(2, 5),
  };
}

// HTTP headers tambahan untuk konsisten dengan UA yang diset.
// Sec-CH-UA dkk biasanya dikirim Chrome berdasar binary version aslinya;
// kita override eksplisit biar match sama UA yang kita rotasikan.
export function buildExtraHeaders(fp) {
  const major = fp.chromeMajor;
  const baseLang = fp.locale.split('-')[0];
  return {
    'Sec-CH-UA': `"Chromium";v="${major}", "Not_A Brand";v="24", "Google Chrome";v="${major}"`,
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"Windows"',
    'Accept-Language': `${fp.locale},${baseLang};q=0.9`,
  };
}

// Init script di-inject sebelum semua script halaman jalan.
// Pakai Object.defineProperty(..., { configurable: true }) supaya pemeriksa
// fingerprint yang nge-cek descriptor gak langsung curiga.
export function buildInitScript(fp) {
  const safe = (v) => JSON.stringify(v);
  return `
    (() => {
      try {
        const seed = ${safe(fp.seed)};

        // ---- navigator overrides ----
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
        Object.defineProperty(navigator, 'platform', { get: () => ${safe(fp.platform)}, configurable: true });
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${fp.hardwareConcurrency}, configurable: true });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => ${fp.deviceMemory}, configurable: true });
        Object.defineProperty(navigator, 'languages', { get: () => [${safe(fp.locale)}, ${safe(fp.locale.split('-')[0])}], configurable: true });

        // Plugins palsu, panjangnya berbeda-beda
        const fakePlugins = Array.from({ length: ${fp.pluginsCount} }, (_, i) => ({
          name: 'Plugin ' + i,
          filename: 'plugin' + i + '.dll',
          description: '',
          length: 1,
        }));
        Object.defineProperty(navigator, 'plugins', { get: () => fakePlugins, configurable: true });

        // ---- screen overrides ----
        Object.defineProperty(screen, 'width', { get: () => ${fp.screen.width}, configurable: true });
        Object.defineProperty(screen, 'height', { get: () => ${fp.screen.height}, configurable: true });
        Object.defineProperty(screen, 'availWidth', { get: () => ${fp.screen.availWidth}, configurable: true });
        Object.defineProperty(screen, 'availHeight', { get: () => ${fp.screen.availHeight}, configurable: true });
        Object.defineProperty(screen, 'colorDepth', { get: () => ${fp.screen.colorDepth}, configurable: true });
        Object.defineProperty(screen, 'pixelDepth', { get: () => ${fp.screen.colorDepth}, configurable: true });

        // ---- WebGL vendor/renderer ----
        const spoofWebGL = (proto) => {
          if (!proto) return;
          const orig = proto.getParameter;
          proto.getParameter = function (parameter) {
            // UNMASKED_VENDOR_WEBGL
            if (parameter === 37445) return ${safe(fp.webgl.vendor)};
            // UNMASKED_RENDERER_WEBGL
            if (parameter === 37446) return ${safe(fp.webgl.renderer)};
            return orig.apply(this, arguments);
          };
        };
        if (typeof WebGLRenderingContext !== 'undefined')  spoofWebGL(WebGLRenderingContext.prototype);
        if (typeof WebGL2RenderingContext !== 'undefined') spoofWebGL(WebGL2RenderingContext.prototype);

        // ---- Canvas noise ----
        // Geser 1 pixel dengan alpha sangat rendah, posisi & warna ditentukan seed.
        // Nilai akhir toDataURL/getImageData jadi unik per fingerprint.
        const sx = parseInt(seed.substring(0, 4), 16);
        const sy = parseInt(seed.substring(4, 8), 16);
        const sr = parseInt(seed.substring(8, 10), 16);
        const sg = parseInt(seed.substring(10, 12), 16);
        const sb = parseInt(seed.substring(12, 14), 16);

        const _toDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function () {
          try {
            if (this.width > 16 && this.height > 16) {
              const ctx = this.getContext('2d');
              if (ctx) {
                ctx.save();
                ctx.fillStyle = 'rgba(' + sr + ',' + sg + ',' + sb + ',0.005)';
                ctx.fillRect(sx % this.width, sy % this.height, 1, 1);
                ctx.restore();
              }
            }
          } catch (e) {}
          return _toDataURL.apply(this, arguments);
        };

        const _getImageData = CanvasRenderingContext2D.prototype.getImageData;
        CanvasRenderingContext2D.prototype.getImageData = function () {
          const data = _getImageData.apply(this, arguments);
          try {
            // Geser sedikit di byte tertentu — tetap deterministik per seed.
            const offset = (sx + sy) % Math.max(1, data.data.length - 1);
            data.data[offset] = (data.data[offset] + (sr % 3)) & 0xff;
          } catch (e) {}
          return data;
        };

        // ---- AudioContext noise ----
        if (typeof AnalyserNode !== 'undefined') {
          const _getFloat = AnalyserNode.prototype.getFloatFrequencyData;
          AnalyserNode.prototype.getFloatFrequencyData = function (array) {
            _getFloat.apply(this, arguments);
            const drift = ((sr / 256) - 0.5) * 0.0001;
            for (let i = 0; i < array.length; i++) array[i] += drift;
          };
        }

        // ---- Permissions API tweak (notifications gak boleh "denied" + webdriver true) ----
        if (navigator.permissions && navigator.permissions.query) {
          const origQuery = navigator.permissions.query.bind(navigator.permissions);
          navigator.permissions.query = (params) => {
            if (params && params.name === 'notifications') {
              return Promise.resolve({ state: Notification.permission, onchange: null });
            }
            return origQuery(params);
          };
        }
      } catch (e) {
        // Jangan biarkan error fingerprint mematikan halaman — log aja.
        console.error('[fp-init] error:', e && e.message);
      }
    })();
  `;
}

// CLI test: `node fingerprint.js` — print 3 contoh fingerprint
if (process.argv[1] && (
    import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1].endsWith('fingerprint.js'))) {
  for (let i = 0; i < 3; i++) {
    const fp = generateFingerprint();
    console.log(`\n--- Sample ${i + 1} ---`);
    console.log('UA            :', fp.userAgent);
    console.log('Viewport      :', `${fp.viewport.width}x${fp.viewport.height} (DPR ${fp.deviceScaleFactor})`);
    console.log('Screen        :', `${fp.screen.width}x${fp.screen.height} @ ${fp.screen.colorDepth}bpp`);
    console.log('Locale / TZ   :', fp.locale, '/', fp.timezone);
    console.log('CPU / Mem     :', fp.hardwareConcurrency, 'cores /', fp.deviceMemory, 'GB');
    console.log('GPU vendor    :', fp.webgl.vendor);
    console.log('GPU renderer  :', fp.webgl.renderer);
    console.log('Plugins count :', fp.pluginsCount);
    console.log('Seed          :', fp.seed.substring(0, 16) + '…');
  }
}
