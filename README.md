# PhotoArchiver License Issuer

独立的 PhotoArchiver 授权签发服务。服务使用 Ed25519 私钥签发绑定机器指纹的许可证，并提供受保护的管理界面用于创建、查询和归档许可证。

## Requirements

- Node.js 24.15.x
- An Ed25519 PKCS8 private key stored outside this repository

## Setup

```powershell
npm install
Copy-Item .env.example .env
npm run admin:init
npm start
```

Edit `.env` before starting the service. `LICENSE_PRIVATE_KEY_PATH` must point to the signing key, and `LICENSE_EXPECTED_PUBLIC_KEY` must match the public key embedded in the PhotoArchiver client.

The SQLite database is created under `data/` and is intentionally excluded from Git. Credentials, private keys, and deployment secrets must never be committed.

## Commands

```powershell
npm test
npm run build
npm run admin:reset-password
npm run admin:rename
npm run check-key
```

For HTTPS deployment, put the service behind a reverse proxy and set `PUBLIC_ORIGIN` to the exact HTTPS origin. `Caddyfile.example` contains a sample proxy configuration.
