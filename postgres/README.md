# CLabs PostgreSQL migration

Use a separate PostgreSQL project and branch for CLabs.
Database: neondb; application schema: knox.

The Worker uses server-only DATABASE_URL with the Neon HTTP driver. Credentials are never bundled into the browser. All existing API authorization and reviewer checks remain active.

Before cutover, database reads use the original D1 database and all API writes are paused. The owner POSTs /api/admin/migrate. The handler snapshots all six source tables in one D1 batch, copies them in one PostgreSQL transaction, compares every source and destination row, then marks the migration ready. Subsequent requests use PostgreSQL for accounts, interfaces, analyzer messages, audit events and laboratory workspace. A failed verification leaves writes paused and does not activate the target. Retrying a completed migration does not overwrite records.

The original D1 database is retained unchanged as the pre-migration backup. Do not roll back to it after PostgreSQL accepts new writes without first reconciling those changes. A rollback of the application alone could otherwise hide new records.

This is a backend database migration, not completion of the 300,000-patient redesign. The current frontend still reads and saves a bounded legacy workspace document (10,000 records per collection; 2 MB API request cap). It requires record-level endpoints, pagination, file object storage integration and load testing before larger-scale use. The separate migration-draft directory preserves the prior unfinished record-storage work; it is not built into this deployment.

Neon currently reports a 512 MiB logical database limit on the selected free plan. No paid upgrade was performed.
