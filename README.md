# LenDen

LenDen is a privacy-first personal finance PWA to track money you lend, receive, and borrow.  
It runs entirely in the browser with local storage and no backend dependency.

## Highlights

- PIN-protected app with optional biometric unlock support.
- Lending and borrowing tracking with person-wise detail views.
- Rich transaction model:
  - categories, payment modes, status
  - card linkage
  - fees and GST calculations
  - attachments/proofs
  - refunds
- EMI tracking for lending transactions:
  - EMI metadata (rate, tenure, start/end, processing fee + GST, optional GST on interest)
  - separate EMI schedule store (`ld2_emi_schedules`)
  - scheduled installments do not affect paid balance until confirmed as received
  - safe rebuild of pending EMI schedule while preserving settled installments
- Backup and restore:
  - export JSON backup
  - share backup
  - import backup
  - upgrade safety snapshot and restore
- PWA capabilities:
  - installable
  - offline cache via service worker
  - update banner flow
- Theme system:
  - dark/light mode
  - background theme presets per mode with contrast-safe token strategy

## Project Structure

- `index.html` - app shell and page containers
- `css/styles.css` - theme tokens and component styling
- `js/app.js` - application logic (storage, UI flows, calculations, migrations)
- `sw.js` - service worker cache and update behavior
- `manifest.json` - PWA manifest
- `tests/regression.html` + `tests/regression.js` - browser regression harness
- `tests/e2e/smoke.spec.js` - Playwright smoke tests
- `playwright.config.js` - Playwright config (mobile Chromium project + local web server)

## Data Model (localStorage)

Primary keys:

- `ld2_people`
- `ld2_cards`
- `ld2_txns`
- `ld2_payments` (actual repayments received)
- `ld2_emi_schedules` (planned EMI installments)
- `ld2_borrows`
- `ld2_bpayments`
- `ld2_refunds`
- `ld2_settings`
- `ld2_pin`
- `ld2_report_views`
- `ld2_app_version`
- `ld2_upgrade_snapshot_latest`

Backward compatibility:

- Storage migration paths exist for legacy keys and older backup payloads.
- Data normalization runs at startup for numeric/date integrity and legacy attachment compatibility.

## Run Locally

No build step is required for the app itself.

Option 1 (simple):

1. Open `index.html` directly in a browser.

Option 2 (recommended for Playwright tests):

1. Run a local static server in project root:
   - `python3 -m http.server 8080`
2. Open:
   - `http://127.0.0.1:8080/index.html`

## Testing

Install dev dependencies:

- `npm install`

Playwright smoke tests:

- `npm run test:smoke`
- `npm run test:smoke:headed`
- `npm run test:smoke:debug`

Manual regression harness:

1. Open `tests/regression.html`
2. Click **Run Tests**

## Deployment

- Netlify static publish root is configured as `.` in `netlify.toml`.
- CI smoke workflow: `.github/workflows/netlify-smoke.yml`.

## Design and Safety Principles

- Keep app client-only and static-hostable.
- Preserve backward compatibility for stored financial data.
- Never auto-settle scheduled EMI entries without explicit user confirmation.
- Prefer deterministic calculations and explicit state updates.
- Prioritize readability and maintainability in a single-file app architecture.

## Upgrade Guidance (for existing users)

Before upgrading:

1. Export a backup from Settings.
2. Save/share the backup safely.

After upgrading:

1. Verify key dashboard totals and a few known transactions.
2. If needed, import the backup from Settings.

