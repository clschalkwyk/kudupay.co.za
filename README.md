### KuduPay — Smart Student Payments (with Koos the Kudu)

KuduPay helps South African students spend within sponsor-defined budgets at approved merchants. Students get freedom with guardrails; sponsors get clarity and control. Koos the Kudu nudges everyone in the right direction.

- Frontend: React + TypeScript + Tailwind + Vite (+ PWA)
- Backend: Express on AWS Lambda (container image) + API Gateway + DynamoDB (single-table)
- Validation: Zod at the edges (APIs)
- Data: Direct DynamoDB access via a small helper
- Brand: Koos the Kudu — our helpful, wise, and witty guide

Links:
- Web: https://www.kudupay.co.za
- API: https://api.kudupay.co.za/api (example)
- Youtube: https://youtu.be/MbVulpSMLrk
---

### Repo Structure

- frontend/ — Vite React app, Tailwind, PWA
    - Makefile — build & S3 deploy helpers
    - src/components — pages like HomePage, ForSponsors, Navigation
    - .env — frontend env (VITE_*)
- backend/ — Express app wrapped for Lambda
    - Makefile — build, ECR push, Lambda deploy, API Gateway setup
    - scripts/
        - generate-lambda-env-cmd.js — convert .env → Lambda env JSON
        - generate_admin_json.js — generate admin user JSON for seeding
    - src/routes/students.ts — sample student routes (balance, transactions)
    - src/services/sponsorship.store.ts — DynamoDB access & domain helpers
- .docs/BRAND_VOICE.md — Koos brand voice & UX copy

---

### Prerequisites

- Node.js 18+ and npm
- AWS CLI configured (for deploys)
- Docker (to build Lambda container images)
- A DynamoDB table (single-table) with:
    - PK (string), SK (string)
    - Optional GSIs used by code:
        - GSI1: GSI1PK, GSI1SK (optional; used for queries like sponsor EFT listing)
        - GSI2: GSI2PK, GSI2SK (required; used for student views)
- An ECR repository (Makefile can create it)
- An IAM role for Lambda (execution role with CloudWatch Logs + DynamoDB access)

---

### Quick Start (Local)

- Terminal A (backend):
    1) cd backend
    2) npm ci
    3) Create backend/.env (see “Backend environment variables” below)
    4) npm run dev (or make dev)
    - Local backend default port: 3000

- Terminal B (frontend):
    1) cd frontend
    2) npm ci
    3) Create frontend/.env (see “Frontend environment variables” below)
    4) npm run dev
    - Local frontend default: http://localhost:5173

Tip: For local dev, set frontend VITE_API_URL to http://localhost:3000/api.

---

### Frontend environment variables (frontend/.env)

- Example (current production-like sample):

```
VITE_API_URL=https://api.kudupay.co.za/api
VITE_PAY_API_URL=https://pay.kudupay.co.za

VITE_SPONSOR_DYNAMIC_ALLOCATIONS=true

# Where QR redirects land inside the app (used by QR builders)
QR_DESTINATION_URL=https://kudupay.co.za/pay?paymentId={paymentId}
```

- Local dev example:

```
VITE_API_URL=http://localhost:3000/api
VITE_PAY_API_URL=http://localhost:3000   # if needed
VITE_SPONSOR_DYNAMIC_ALLOCATIONS=true
QR_DESTINATION_URL=http://localhost:5173/pay?paymentId={paymentId}
```

Note: vite.config.ts allows PWA, fonts caching, and treats GET /api/* as network-only in Workbox.

---

### Backend environment variables (backend/.env)

At minimum, configure:

```
# DynamoDB
DB_TABLE_NAME=<your_dynamo_table_name>
DB_TABLE_REGION=af-south-1

# Public URLs optional
PAY_API_URL=https://pay.kudupay.co.za

# Admin seeding (optional)
ADMIN_EMAIL=admin@kudupay.test
ADMIN_PASSWORD=Admin@12345
ADMIN_FIRST_NAME=Koos
ADMIN_LAST_NAME=Admin

# Any additional variables used by other modules...
```

Apply to Lambda using provided scripts and Make targets (see “Deploy backend” below).

---

### Seeding an Admin User

The script backend/scripts/generate_admin_json.js creates an admin user JSON with a bcrypt’d password.

- Generate JSON:

```
cd backend
# Uses ADMIN_* vars from backend/.env if present
node scripts/generate_admin_json.js
# Outputs backend/admin_auth.json
```

- Insert into DynamoDB:
    - The script writes a ready-to-put item with keys:
        - Pk: ADMIN#<uuid>
        - Sk: USER
        - entity: USER
        - role: admin
    - Put via AWS CLI (replace placeholders):

```
aws dynamodb put-item \
  --table-name "<DB_TABLE_NAME>" \
  --region "<DB_TABLE_REGION>" \
  --item file://admin_auth.json
```

Never commit admin_auth.json. Rotate the password after first login.

---

### Running Locally

- Backend:
    - npm run dev
    - Or: make dev
    - Endpoint base: http://localhost:3000/api

- Frontend:
    - npm run dev
    - Opens http://localhost:5173

CORS: If needed, allow http://localhost:5173 from backend during development.

---

### API Usage Examples

Student-facing routes (from backend/src/routes/students.ts). Replace IDs/tokens with real values.

- Get student balance

```
curl -s -H "Authorization: Bearer <JWT>" \
  http://localhost:3000/api/students/<studentId>/balance
```

Response:

```
{
  "message": "Student balance retrieved successfully",
  "data": {
    "student_id": "...",
    "total_balance": 0,
    "available_balance": 0,
    "category_limits": { ... },
    "persisted_budgets": [ ... ],
    "recent_transactions": []
  }
}
```

- Get student transactions (cursor-ready; dev rate-limited)

```
curl -s -H "Authorization: Bearer <JWT>" \
  "http://localhost:3000/api/students/<studentId>/transactions?limit=20"
```

Response keys: data.transactions[], data.pagination, data.filters.

- List sponsors for a student

```
curl -s -H "Authorization: Bearer <JWT>" \
  http://localhost:3000/api/students/<studentId>/sponsors
```

- Pay (stubbed demo endpoint)

```
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"qr_code_id":"QR123","amount":5000,"student_id":"<studentId>"}' \
  http://localhost:3000/api/students/pay
```

Note: In production this would validate sponsor rules and perform the payment workflow; current implementation returns a placeholder.

Backend tips:
- Sponsorship domain helpers live in sponsorship.store.ts.
- Ensure GSI2 exists for student-partition queries. Code logs a clear error at startup if missing.

---

### Build and Deploy — Backend (Lambda + API Gateway)

All commands run from backend/ and require AWS CLI + Docker.

- One-shot release (build image → push to ECR → deploy to Lambda)

```
# Set your function name (must already exist or we'll create if configured)
make release LAMBDA_FUNCTION_NAME=kudupay-backend-api
# Or specify IMAGE_TAG:
make release LAMBDA_FUNCTION_NAME=kudupay-backend-api IMAGE_TAG=YYYYMMDDHHMMSS
```

- First-time setup steps

1) Build & push image:

```
make docker-push IMAGE_TAG=YYYYMMDDHHMMSS
```

2) Create Lambda function (if not created):

```
make lambda-create LAMBDA_FUNCTION_NAME=kudupay-backend-api \
  LAMBDA_ROLE_ARN=arn:aws:iam::<account>:role/kudupay-backend-lambda-exec
```

3) API Gateway (HTTP API) integration:

```
# Creates API if needed, integrates Lambda, sets routes ANY / and ANY /{proxy+}, sets up stage
make apigw-setup LAMBDA_FUNCTION_NAME=kudupay-backend-api
make apigw-url   # prints invoke URL
```

4) Sync environment variables from .env to Lambda:

```
# Generate JSON from .env
make lambda-env LAMBDA_FUNCTION_NAME=kudupay-backend-api
# Apply to Lambda
make lambda-env-apply LAMBDA_FUNCTION_NAME=kudupay-backend-api
# or do both:
make lambda-env-set LAMBDA_FUNCTION_NAME=kudupay-backend-api
```

- Update deployment to a new image:

```
make deploy LAMBDA_FUNCTION_NAME=kudupay-backend-api IMAGE_TAG=YYYYMMDDHHMMSS
```

- Local Lambda container test:

```
make docker-build
make docker-run
# Invoke:
curl -s http://localhost:9000/2015-03-31/functions/function/invocations -d '{"path":"/health","httpMethod":"GET"}'
```

---

### Build and Deploy — Frontend (S3 + optional CloudFront)

All commands run from frontend/.

- Build:

```
make build
```

- Upload to S3:

```
make s3-sync S3_BUCKET=my-static-bucket [S3_PREFIX=web] [AWS_PROFILE=prod] [DRY_RUN=true]
```

- Full deploy (build + sync):

```
make deploy S3_BUCKET=my-static-bucket
```

- CloudFront cache invalidation (optional):

```
make cloudfront-invalidate CF_DISTRIBUTION_ID=E123ABC456DEF
```

Notes:
- Makefile performs 2 sync passes:
    - Non-HTML with cache-control: public,max-age=31536000,immutable
    - HTML with cache-control: no-store
- vite-plugin-pwa is enabled; ensure your domain serves correct headers.

---

### Frontend Features

- Home landing with Koos panels and “How it works”
- Role-aware navigation (student/sponsor/merchant/admin)
- ForSponsors.tsx includes:
    - Registration/login flows via AuthContext
    - Dashboard tabs (join, login, dashboard, fund, activity, EFT, support, Koos)
    - Currency helpers and category management
    - API base detection from VITE_API_URL
- PWA manifest and Workbox caching of fonts and static assets

---

### DynamoDB Notes

- Single-table design; entities include USER, SPONSORSHIP, ledger entries, EFTs, etc.
- GSI2 (required): for student-centric access:
    - GSI2PK = STUDENT#<studentId>, GSI2SK = SPON#... for sponsorships
- GSI1 (optional): for sponsor-centric listings:
    - GSI1PK = SPONSOR#<sponsorId>, GSI1SK = SPON#... or EFT#...
- Code gracefully warns if GSI1 is missing, and errors if GSI2 is missing.

Ensure IAM role for Lambda has:
- dynamodb:PutItem, GetItem, Query, UpdateItem, DeleteItem on your table and indexes
- logs:CreateLogGroup/Stream, logs:PutLogEvents for CloudWatch

---

### Security & Operational Notes

- Never commit secrets. Keep .env files out of VCS.
- Use the Makefile workflow to push env to Lambda from a secure machine.
- Rate limiting exists on student transactions endpoint for dev; replace with a managed solution (e.g., API Gateway throttling or express-rate-limit) for production.
- Passwords are bcrypt-hashed. Rotate initial admin password after first login.
- Add TLS (HTTPS) end-to-end. API Gateway provides TLS; for custom domains, attach ACM certs.

---

### Troubleshooting

- 500/Startup error mentioning GSI2: Create GSI2 with keys GSI2PK/GSI2SK as described.
- “API not reachable” from frontend: Verify VITE_API_URL and CORS on backend.
- Lambda can’t access DynamoDB: Check role policy and table ARN/region.
- S3 deploy looks stale: Ensure CloudFront invalidation if using CDN; HTML served with no-store.

---

### Demo/Smoke Tests

- Backend health (if exposed):

```
curl -s https://<api-id>.execute-api.<region>.amazonaws.com/prod/health
```

- Student transactions:

```
curl -s -H "Authorization: Bearer <JWT>" \
  "https://api.kudupay.co.za/api/students/<studentId>/transactions?limit=10"
```

- Frontend PWA:
    - Open on mobile, add to home screen
    - Toggle online/offline; app shell should load with cached assets

---

### Brand & Voice

See .docs/BRAND_VOICE.md for Koos’ tone and UX copy patterns. Keep phrasing helpful, local, and respectful. Koos doesn’t nag — he nudges.

---
