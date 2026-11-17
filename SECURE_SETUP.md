# Secure personal workspace setup (not deployed yet)

The existing public GitHub Pages website stays unchanged until Cloudflare is configured.

## 1. Create D1 database

In Cloudflare Dashboard → Workers & Pages → D1 SQL Database, create `careerfinder-ai`. Copy its **database ID**.

In `wrangler.jsonc`, add:

```json
"d1_databases": [
  { "binding": "DB", "database_name": "careerfinder-ai", "database_id": "YOUR_REAL_DATABASE_ID" }
]
```

Apply `migrations/0001_personal_workspace.sql` to the **remote** D1 database (Dashboard SQL console, or Wrangler migrations workflow). Do not place the database ID in secrets; it is a configuration identifier.

## 2. Set a password hash as a Cloudflare Worker secret

Generate a random salt and PBKDF2-SHA256 hash locally, using this Python snippet (do not put the password or hash in GitHub):

```python
import os,hashlib,base64,getpass
password=getpass.getpass("Choose a strong CareerFinder password: ").encode()
salt=os.urandom(16)
digest=hashlib.pbkdf2_hmac("sha256",password,salt,100000,32)
print("100000:"+base64.b64encode(salt).decode()+":"+base64.b64encode(digest).decode())
```

In Cloudflare Worker settings → Variables and Secrets, create an encrypted secret named `ADMIN_PASSWORD_HASH` with the generated value. Do not use a plain-text password as the secret.

## 3. Enable and test

After D1 binding, migration and secret are configured, deploy the branch code to the existing Worker. Then enable the website login UI in a separate reviewed change. The new private API is intentionally not activated in production until those steps are complete.

Endpoints: POST /api/private/login, POST /api/private/logout, GET/PUT /api/private/profile, GET/POST /api/private/applications.

Security: HTTPS only; password hashing; bearer token expires after 12 hours; server-side session hashes; strict GitHub Pages CORS origin; basic login rate limiting. Before production use, add Cloudflare WAF rate limits and protect the public GitHub Pages frontend from exposing personal data. Do not commit credentials, identity documents or personal CVs to the repository.

**Important:** This first version stores the profile JSON in D1 as plaintext at the application layer. Cloudflare's infrastructure protections do not amount to field-level encryption. Consider application-layer encryption for sensitive profile fields before storing detailed addresses and documents.
