# KuduPay Backend Infra Notes

This service uses DynamoDB as the source of truth. A couple of global secondary indexes (GSIs) are expected for scalability.

Required:
- GSI2
  - Partition key: `GSI2PK`
  - Sort key: `GSI2SK`
  - Usage: `getSponsorshipsForStudentAsync` queries `GSI2` with
    - `GSI2PK = STUDENT#{id}`
    - `GSI2SK` begins with `SPON#`
  - Startup behavior: the server performs a one-time readiness check at startup and exits if GSI2 is missing or unreachable.

Optional:
- GSI1
  - Partition key: `GSI1PK`
  - Sort key: `GSI1SK`
  - Usage: sponsor-scoped EFT status listing prefers GSI1 when filtering by status:
    - `GSI1PK = SPONSOR#{id}`
    - `GSI1SK = EFT#{status}#{created_at}`
  - If missing, the code falls back to a primary-partition `Query` and filters in app.

Admin EFT listing (no GSI required):
- We maintain a lightweight mirror partition for admin listing to avoid table scans:
  - Admin mirror partition: `Pk = 'EFT#ALL'`
  - Sort key: `Sk = 'STATUS#{status}#{created_at}#{id}'`
  - On create (status=new): we `Put` this mirror item.
  - On approve/reject: we move the mirror in a single `transactWrite` along with the primary EFT update.

Idempotency TTL:
- Idempotency records include `expires_at` (epoch seconds) based on `IDEMPOTENCY_TTL_DAYS` env var (default 14 days).
- Enable DynamoDB TTL on the table for the attribute name `expires_at` to automatically purge old idempotency entries.

Environment variables:
- `DB_TABLE_NAME` (default `users`)
- `DB_TABLE_REGION` (default `af-south-1`)
- `API_BASE_PATH` (default `/api` locally; empty string on Lambda)
- `IDEMPOTENCY_TTL_DAYS` (default `14`)

Startup behavior:
- On boot, the server calls `ensureIndexesOnce()` to verify GSI2 (required) and probe GSI1 (optional). If GSI2 is missing, the process exits with a clear log message.

Pagination cursors:
- Routes accept cursor inputs in base64 or JSON.
- Routes always return cursors encoded as base64.
