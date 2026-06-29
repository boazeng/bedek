# CMM — AWS deployment (serverless)

Deploys: FastAPI on **Lambda** behind an **HTTP API**, a **private RDS PostgreSQL**,
and the React SPA on **S3 + CloudFront**. CloudFront routes `/api/*` to the API and
everything else to S3 — one origin, no CORS, RDS never public.

```
                    ┌──────────── CloudFront ────────────┐
   browser ───────► │  /api/*  → HTTP API → Lambda ──┐    │
                    │  /*      → S3 (React build)     │    │
                    └─────────────────────────────────┼────┘
                                                       ▼
                                              RDS PostgreSQL (private, in-VPC)
```

## Prerequisites
- **AWS CLI** configured (`aws sts get-caller-identity` should work).
- **AWS SAM CLI** — `sam --version`. Install: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html
- **Node 20** for the frontend build.

> No Docker needed: all backend deps are pure-Python (`pg8000` Postgres driver,
> stdlib PBKDF2 for passwords, `openpyxl` for Excel I/O), so a plain `sam build`
> produces a Lambda-correct package on any OS.

---

## Step 0 — pick a VPC + two subnets
RDS needs a subnet group spanning **≥2 AZs**. Use the default VPC:

```powershell
aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query "Vpcs[0].VpcId" --output text
aws ec2 describe-subnets --filters Name=vpc-id,Values=<VPC_ID> --query "Subnets[].{id:SubnetId,az:AvailabilityZone}" --output table
```
Note the VPC id and **two subnet ids in different AZs**.

## Step 1 — build
```powershell
cd infra
sam build
```

## Step 2 — deploy the stack (first time: guided)
```powershell
sam deploy --guided
```
Answer the prompts (stack `cmm-bedek`, region `us-east-1`) and supply parameters:

| Parameter | Value |
|---|---|
| `VpcId` | from Step 0 |
| `SubnetIds` | the two subnet ids, comma-separated |
| `DBUsername` | `cmmadmin` (default) |
| `DBPassword` | strong, ≥12 chars, **no** `/ @ " ` or spaces |
| `JwtSecret` | long random (e.g. `python -c "import secrets;print(secrets.token_urlsafe(48))"`) |
| `SeedAdminEmail` | your admin email |
| `SeedAdminPassword` | strong, ≥10 chars |
| `DBInstanceClass` | `db.t4g.micro` (default) |

RDS creation takes ~5–10 min. Note the **Outputs**: `SiteURL`, `FrontendBucketName`,
`DistributionId`, `MigrateFunctionName`.

> Re-deploys after the first time: just `sam build && sam deploy` (params are
> remembered in `samconfig.toml`; secrets are re-prompted or pass
> `--parameter-overrides`).

## Step 3 — create the schema + super_admin
Invoke the migrate function once (it runs `create_all` + in-place migrations + seeds the
super_admin from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`):

```powershell
aws lambda invoke --function-name cmm-bedek-migrate --cli-binary-format raw-in-base64-out out.json
cat out.json   # → {"tables":"ensured","super_admin_email":"...","super_admin_id":1}
```

## Step 4 — build + publish the frontend
```powershell
cd ../frontend
npm install
npm run build
aws s3 sync dist/ s3://<FrontendBucketName>/ --delete
aws cloudfront create-invalidation --distribution-id <DistributionId> --paths "/*"
```

## Step 5 — log in
Open **`SiteURL`** in the browser → log in with `SeedAdminEmail` / `SeedAdminPassword`.
(The dev-login dropdown does **not** appear — `ENABLE_DEV_LOGIN=false` in production.
The frontend automatically falls back to the email + password form.)

The first super_admin has no company yet. Create companies + users from inside the
admin UI (`ניהול מערכת → חברות`, `משתמשי מערכת`, etc.).

---

## Operating notes

**SPA deep-links** — direct loads/refreshes of client-side routes (e.g.
`/projects/edit/4`, `/templates/edit/N`) are served `index.html` by the
`SpaRewriteFunction` CloudFront Function, attached only to the S3 default
behavior. Without it S3 returns an `AccessDenied` XML for the missing object.
`/api/*` is untouched (separate behavior), so API 403/404s still pass through.

**Future schema changes** — `create_all` + the in-place migration registry in
[backend/app/database.py](../backend/app/database.py#L34) handle additive changes
(new tables, new columns). For destructive schema changes (renames, drops), add
Alembic against RDS. RDS is private, so either temporarily flip `PubliclyAccessible`
+ a temporary ingress rule from your IP, or run Alembic from a bastion/CloudShell in
the VPC.

**Production hardening** (when it holds real customer data):
- `MultiAZ: true` on the RDS (HA; ~2× DB cost).
- `DeletionProtection: true` on the RDS.
- Move `DBPassword` / `JwtSecret` from Lambda env vars to **AWS Secrets Manager**
  (needs a VPC endpoint for Secrets Manager, since the Lambda has no internet route).

**Rough monthly cost** (low traffic, us-east-1):
- RDS `db.t4g.micro` Single-AZ + 20GB gp3 ≈ **$13–16**
- Lambda + HTTP API ≈ **$0–3**
- S3 + CloudFront ≈ **$1–5**
- **≈ $15–25/month.** (Multi-AZ adds ~$13.)

**Tear down** — `sam delete` (RDS keeps a final snapshot via its `DeletionPolicy`).
