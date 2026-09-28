# License Issuer

通用卡密授权服务：管理员创建产品专属卡密，客户端在线激活，获取绑定本机的 Ed25519 签名许可证后离线使用。默认一张卡允许两台电脑，支持 PhotoArchiver 和 wallpaper 的统一服务端授权流程。

PhotoArchiver 的在线激活客户端改造、wallpaper 的正式接入均需在各自项目中完成。本仓库保留旧 PhotoArchiver `PA1` 接口和记录，新增卡密使用 `GL1` 协议，不会自动转换旧许可证或修改客户端。

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

Edit `.env` before starting the service. `LICENSE_PRIVATE_KEY_PATH` must point to the signing key, and `LICENSE_EXPECTED_PUBLIC_KEY` must match the public key embedded in the client applications that consume these licenses.

默认管理员：用户名 `admin`，初始密码 `admin123`。`npm run admin:init` 非交互创建默认账号；直接 `npm start` 也会在管理员表为空时自动创建。已有账号不会被覆盖，修改后的密码不会因重启而重置。需要自定义初始账号时，在空数据库上运行 `npm run admin:init-custom`。

首次使用默认账号登录后，在 Account settings 中修改密码，再重新登录即可使用授权管理功能。暂不校验密码强度，支持简单短密码；仅要求非空、最多 256 个字符，新密码与当前密码不同。

修改密码接口：`PATCH /api/account/password`，请求体如下。需登录会话、同源 `Origin`、`X-CSRF-Token`（登录或会话接口返回），并验证当前密码。成功返回 `{"ok":true,"reauthenticate":true}`，使所有管理员会话失效；之后用新密码登录。

```json
{
  "currentPassword": "admin123",
  "newPassword": "你的新密码"
}
```

原有 `PATCH /api/account` 继续支持修改用户名和密码；界面使用该接口，也已取消密码强度要求。忘记密码时可在服务器执行 `npm run admin:reset-password`。

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

## 卡密管理

后台仅保留卡密管理，可选择产品、版本、设备上限、生成数量和批次备注；每批可生成 1–100 张，生成后可复制全部卡密或下载 TXT。默认设备上限为 2，可设为 1–100。产品列表由 `LICENSE_PRODUCTS` 配置，默认 `photoarchiver,wallpaper`；新增产品使用稳定的小写标识，客户端必须校验自己的产品标识。

- 卡密使用 160 位随机值，格式为 `LIC-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX`。创建时仅显示一次，请复制保存后交付；数据库只保存卡密的 SHA-256 摘要，后台无法找回明文。
- 每张卡只授权一个产品；同一机器重复激活返回同一份许可证，不消耗新名额；不同机器超过额度返回 409。
- 详情可查看已激活的机器和时间。停用卡密后拒绝所有激活请求（包括已绑定机器的重新请求），恢复后继续使用原绑定记录。
- 当前许可证永久有效，不要求定期联网。停用卡密不能撤回已经签发的离线许可证。因此暂不提供解绑释放额度，避免旧电脑仍可离线使用、新电脑又占用释放额度。
- 列表支持逐项勾选及全选本页，搜索、翻页或刷新会清空选择。点击“删除所选”后，确认框显示卡密数量和设备记录数量，需再次点击“确认删除”才执行。删除不可恢复，同时清理关联激活记录；已签发的离线许可证不受影响。批量操作以事务执行，失败时不会部分删除或部分生成。
- 后台已移除旧 PhotoArchiver `PA1` 签发和管理入口，旧数据库记录与兼容接口保留。

首次启动自动新增卡密、激活和限流数据表，保留旧许可证。升级前备份数据库；密钥应长期保留，换密钥需另行设计客户端公钥迁移。

## 客户端在线激活

桌面客户端通过 HTTPS 调用，无需管理员登录、Cookie 或 CSRF token。原生 HTTP 请求无需设置 `Origin`；如果带有该头，必须等于 `PUBLIC_ORIGIN`。管理接口继续要求同源请求和管理员会话，未开放跨域浏览器调用。

```http
POST /api/v1/activate
Content-Type: application/json

{
  "cardCode": "LIC-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX",
  "productId": "photoarchiver",
  "machineFingerprint": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

`wallpaper` 使用同一接口，将 `productId` 换为 `wallpaper`。卡密允许首尾空白与小写输入；机器指纹必须是 `sha256:` 加 64 位小写十六进制。机器指纹应来自稳定的本机标识，不能每次启动随机生成；服务端按指纹计数，并不能独立证明对应真实物理电脑。

成功返回 HTTP 200：

```json
{
  "licenseId": "服务器生成的 UUID",
  "productId": "photoarchiver",
  "machineFingerprint": "sha256:...",
  "edition": "standard",
  "issuedAt": 1790000000000,
  "license": "GL1.<base64url载荷>.<base64url签名>",
  "maxDevices": 2,
  "usedDevices": 1
}
```

错误响应统一为 `{"error":"说明"}`：400 参数无效，403 卡密停用或来源不允许，404 卡密不存在或不属于该产品，409 设备额度已满，429 请求过多（遵循 `Retry-After`），500 服务内部错误。客户端应在收到成功响应且本地验签通过后原子保存 `license`；网络失败时可以重试，不能删除已有有效许可证。

激活限流独立于管理员登录限流：每个实际连接地址每分钟最多 60 次，全局每分钟最多 1000 次，计数持久化。服务不信任客户端提交的转发 IP 头；通过反向代理的请求可能共享代理地址额度，正式部署时可在代理层补充真实客户端限流。

## 离线验签协议 GL1

许可证共三段，以 `.` 分隔。第一段必须严格等于 `GL1`；第二段为 UTF-8 JSON 原始字节的无填充 base64url；第三段为 Ed25519 签名的无填充 base64url。

签名消息为 **ASCII `GL1.` 的字节与解码后的原始 JSON 字节拼接**，不是 base64url 文本，也不是重新序列化后的 JSON。协议前缀参与签名，不能将 `GL1` 改为旧的 `PA1` 复用。

载荷字段：`version`（固定为 1）、`licenseId`、`cardId`、`productId`、`machineFingerprint`、`edition`、`issuedAt`（Unix 毫秒）。不包含卡密和管理备注，当前无到期字段。

客户端每次启动在本地执行：

1. 检查格式、协议前缀及字段类型，用应用内置的可信 Ed25519 公钥验证原始消息签名。不能使用响应里动态传来的公钥替代内置信任根。
2. 检查 `version === 1`、`productId` 严格等于本应用标识、`machineFingerprint` 等于当前机器，以及 `edition` 为应用支持的版本。
3. 验证成功后开启授权功能。启动和正常使用不依赖授权服务器在线；授权文件复制到另一台机器应因指纹不符被拒绝。

PhotoArchiver 如需兼容已发出的 `PA1`，应独立保留旧协议验证分支；`PA1` 不包含产品标识，wallpaper 不应接受它。服务端共享一个签名密钥，因此各客户端严格校验产品字段至关重要。

## 管理接口

以下接口均需管理员会话，写请求还需同源 `Origin` 和 `X-CSRF-Token`，临时管理员须先更改密码：

| 接口 | 用途 |
| --- | --- |
| `POST /api/cards` | 创建卡密：`productId`、`edition`，可选 `maxDevices`（默认 2）、`note`；返回 201，仅此响应包含 `cardCode` |
| `POST /api/cards/batch` | 批量生成：上述创建字段加 `quantity`（1–100）；返回 201，`{items,total}`，各项包含仅显示一次的 `cardCode` |
| `DELETE /api/cards/batch` | 批量删除：`{"cardIds":["UUID"],"confirmed":true}`，1–100 个不重复 ID；返回 `{deleted}`；未确认或参数非法返回 400，任一 ID 不存在返回 404，整批不执行 |
| `GET /api/cards?q=...&productId=...&offset=0` | 查询卡密，每页 30 条；包含 `usedDevices`，不含卡密明文或摘要 |
| `GET /api/cards/:cardId` | 详情，包含已绑定设备 `devices` |
| `PATCH /api/cards/:cardId` | `{"status":"disabled"}` 停用或 `{"status":"active"}` 恢复 |
| `/api/licenses`、`/api/licenses/:licenseId` | 保留旧 PhotoArchiver 单机 PA1 签发、查询和归档行为 |
