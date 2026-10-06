# Commercial lab software — CLabs

Cloudflare-compatible Worker with shared D1 storage, server-authorized staff roles, 179 test/panel templates, result review and reporting, and a multi-brand biomedical device integration inbox. Frontend source: web/index.html. Backend: worker/api.js. Database schema: db/schema.ts; generated migrations: drizzle/.

Build: npm ci && npm run build. Migrations: npm run db:generate after schema changes. Sites provisions the logical DB binding and applies migrations before publication. Runtime owner email is configured through hosting, not committed to the repository.

The login screen uses manual username and password entry. The owner password is held as a server-side hash; it is never stored in the browser. Staff usernames and password hashes are created by an administrator and should only be shared with authorized staff. See integration/README.md for API contracts, hardware limitations and local gateway setup.

This remains an unvalidated laboratory application; do not claim regulatory compliance or universal device compatibility. Reports retain the demonstration label pending clinical validation.

## Finance and imaging

Ultrasound has its own tab and report collection with permanent scan numbers, GMT examination times, structured findings, indication, technique, impression and recommendations. Drafts require ultrasound entry access; final approval requires ultrasound review access and verified patient identity. Final reports support optional signatures and printing. Corrections require ultrasound entry, review and amendment permissions plus an amendment reason; previous report versions are retained. Administrators assign independent ultrasound view, entry, review and amendment privileges under Staff. Laboratory permissions alone grant no ultrasound access, and the server redacts reports for staff without viewing permission.

The Finance page stores administrator-managed GHS test prices and sale records with historical unit prices, payment status, receipt number, patient, quantity and timestamp. It reports current week, month and year totals, pending balances, and CSV export. Price changes do not rewrite earlier sales.

The catalogue includes ultrasound templates for abdominal, pelvic, gynaecological, early and standard obstetric, detailed anatomy, growth/wellbeing, breast, thyroid/neck, renal, KUB, prostate, scrotal, venous/arterial/carotid/aortic Doppler, musculoskeletal, neonatal cranial, soft-tissue and guided procedures. Templates are structured starting points and must be reviewed against local practice parameters; AIUM practice parameters provide a reference list at https://www.aium.org/resources/practice-parameters.

Every result-entry template supports an optional PDF, CSV, text, JPG or PNG source-file attachment up to 1.2 MB. Attachments are retained with the order and exposed as download links on the printable report. Results, reports and administrator records include print controls.

## Reliability checks

Run `npm run build`, `npm test`, `npm run test:reliability`, and `node tests/migration.test.mjs`. Read requests have bounded timeouts and safe retries; writes require reconciliation before retry. Navigation ignores stale responses, form submissions are serialized, and sign-out clears pagination and offline session state. Device-storage failures do not block online access. Offline conflicts preserve both versions until staff explicitly choose a version; reviewed-result amendments still require the online review workflow.

The capacity test uses 300,000 synthetic records in local SQLite. It does not certify hosted PostgreSQL capacity. Browser interaction testing and sustained production load testing must be distinguished from these automated checks.

## Staff attendance

Attendance is stored separately from clinical records in `staff_attendance` (the `knox` schema on Postgres). Its table and arrival-time index are initialized on first attendance use. Administrators have access; other accounts need the `attendance` permission. The Attendance page records a name and GMT arrival time, defaults to now, suggests saved staff names, and displays the latest 200 records for a selected GMT date. Entries retain the recording account and creation time. A stable entry UUID makes repeat submissions idempotent. Attendance needs an online connection; it does not enter the clinical offline merge queue.

## Independent CLabs copy

Copied from source revision `9f1e618b3079987ea7de0b9420e17f34e9161c61`. This repository contains application code and assets only. Configure a new hosting project and separate database; no production credentials or patient records are included. The original deployment project ID is intentionally omitted. The existing internal `knox` database schema and `KNOX_*` environment variable names remain for code compatibility.

Set `KNOX_OWNER_EMAIL` and `KNOX_OWNER_PASSWORD_HASH` (SHA-256 hexadecimal hash of your chosen password) as server secrets. Provide a fresh D1 `DB` binding and apply the `drizzle/` migrations. PostgreSQL is optional and requires the setup in `postgres/`. `npm run build` produces `dist/server/index.js`. For Sites hosting, register a new project and create its own `.openai/hosting.json` with a new project ID and `d1: "DB"`. Original facility contact details are preserved; update them before use for another facility.
