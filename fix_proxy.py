
code = open("/root/xiaomi-reg/register.mjs").read()

old = "browser = await chromium.launch({ headless: true });"
new = """// Parse proxy for Playwright
    let pwProxy = undefined;
    if (PROXY_URL) {
      try {
        const pu = new URL(PROXY_URL);
        pwProxy = { server: pu.protocol + "//" + pu.hostname + ":" + pu.port, username: pu.username, password: pu.password };
      } catch {}
    }
    browser = await chromium.launch({ headless: true, proxy: pwProxy });"""

if old in code:
    code = code.replace(old, new)
    open("/root/xiaomi-reg/register.mjs", "w").write(code)
    print("Fixed: Playwright now uses proxy")
else:
    print("ERROR: launch line not found")
