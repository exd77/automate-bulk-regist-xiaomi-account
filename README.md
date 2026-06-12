# Automate Bulk Register Xiaomi Account

Automated bulk registration for Xiaomi (MiMo Platform) accounts with referral binding support. Uses HTTP-only approach for registration, Playwright for referral binding.

## Quick Start

### 1. Install Dependencies

```bash
npm install
npx playwright install chromium
npx playwright install-deps chromium
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Run

```bash
# Register 5 accounts (default)
node register.mjs

# Register N accounts
node register.mjs 10
```

## Environment Variables

Create a `.env` file with:

```env
# 2Captcha API key (required)
TWOCAPTCHA_API_KEY=your_2captcha_api_key

# Gmail for receiving verification emails (required)
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_gmail_app_password

# Domain(s) for email aliases - comma-separated for rotation
DOMAIN=yourdomain.com,anotherdomain.com

# Password for registered accounts
PASSWORD=YourPassword123!

# Referral code to bind after registration
REFERRAL_CODE=XXXXXX

# Proxy (optional) - format: http://user:pass@host:port
PROXY_URL=

# Telegram notifications (optional)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

## How It Works

### Registration (HTTP-only, no browser)

1. Generate human-like email aliases with multi-domain rotation
2. Solve reCAPTCHA v2 Enterprise via 2Captcha API
3. Encrypt credentials with RSA + AES (matching Xiaomi's client-side crypto)
4. Send verification email via Xiaomi's `sendEmailRegTicket` API
5. Poll Gmail IMAP for verification code (catch-all forwarding)
6. Verify and create account via `verifyEmailRegTicket` API

### Referral Binding (Playwright browser)

7. SSO login through Xiaomi's OAuth flow
8. Accept platform agreement
9. Check eligibility and bind referral code with humanized delays

## Email Setup (Catch-All)

This bot uses catch-all email forwarding. Any email sent to `*@yourdomain.com` forwards to your Gmail.

### Cloudflare Email Routing

1. Add your domain to Cloudflare
2. Go to **Email** > **Email Routing**
3. Enable catch-all rule, forward to `your_email@gmail.com`
4. Verify destination address

## Proxy Support

Optional rotating proxy support via `undici.ProxyAgent`:

```env
PROXY_URL=http://username:password@proxy-host:port
```

## Output

- `results.json` - Current run results
- `success.json` - Accumulated successful accounts (for `apply_referral.mjs`)
- `logs/` - Timestamped run logs

## Re-Apply Referral

If referral binding failed during registration, retry with:

```bash
node apply_referral.mjs
node apply_referral.mjs 180  # custom delay (seconds) between binds
```

## Project Structure

```
├── register.mjs          # Main bot - bulk registration + referral binding
├── apply_referral.mjs    # Standalone referral applicator (reads success.json)
├── fix_proxy.py          # One-time proxy fix script
├── package.json          # Dependencies
├── .env.example          # Environment template
└── .gitignore            # Excludes .env, results, logs
```

## Disclaimer

This tool is for educational purposes only. Use at your own risk. The authors are not responsible for any consequences of using this tool, including but not limited to account suspensions or violations of Xiaomi's Terms of Service.

## License

MIT
