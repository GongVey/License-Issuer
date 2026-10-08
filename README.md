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

Edit `.env` before starting the service. Supported variables: `LICENSE_PRIVATE_KEY_PATH`, `LICENSE_PRIVATE_KEY_PASSPHRASE`, `LICENSE_EXPECTED_PUBLIC_KEY`, `PUBLIC_ORIGIN`, `HOST`, `PORT`, `DATABASE_PATH`, `LICENSE_PRODUCTS` (default `photoarchiver,wallpaper`), `LICENSE_EDITIONS` (default `standard`). `LICENSE_PRIVATE_KEY_PATH` must point to the signing key, and `LICENSE_EXPECTED_PUBLIC_KEY` must match the public key embedded in the client applications that consume these licenses.

默认管理员：用户名 `admin`，初始密码 `admin123`。`npm run admin:init` 非交互创建默认账号；直接 `npm start` 也会在管理员表为空时自动创建。已有账号不会被覆盖，修改后的密码不会因重启而重置。需要自定义初始账号时，在空数据库上运行 `npm run admin:init-custom`。

首次使用默认账号登录会直接进入「设置新密码」页面，改完重新登录即可使用。暂不校验密码强度，支持简单短密码；仅要求非空、最多 256 个字符，新密码与当前密码不同。

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

`npm test` runs an independent Python Ed25519 verifier (`pip install -r test/requirements.txt`). It calls `python` by default; on systems that only ship `python3`, run `PYTHON=python3 npm test`.

For HTTPS deployment, put the service behind a reverse proxy and set `PUBLIC_ORIGIN` to the exact HTTPS origin. `Caddyfile.example` contains a sample proxy configuration.

## 管理后台

浏览器打开 `PUBLIC_ORIGIN` 登录。界面为原生 ES 模块（`public/app.js` + `public/js/`），无构建步骤、无第三方依赖，遵守严格 CSP（不使用 `innerHTML`、内联脚本或内联样式），支持浅色 / 深色 / 跟随系统和手机宽度。

| 页面 | 用途 |
| --- | --- |
| 概览 | 各产品可售库存（未激活卡）、状态分布、近 30 天激活趋势、最新激活请求 |
| 卡密 | 搜索（客户、备注、订单号、渠道、卡 ID）、按产品 / 状态（未使用、部分激活、已满、已停用）/ 批次筛选；跨页勾选后批量停用、恢复、删除；导出 CSV |
| 批次 | 每次生成为一个批次；整批停用 / 恢复，整批导出含卡密明文的 CSV |
| 日志 | 激活记录（客户端每次请求的结果，保留 180 天）与后台操作日志 |
| 设置 | 产品显示名称与颜色、各产品发货模板、生成预设、主题、账号、数据库备份、激活接口与签名公钥 |
| 旧版许可证 | PhotoArchiver `PA1` 许可证只读查询（侧栏底部入口） |

**快速查找**：`Ctrl/⌘ K` 或顶栏搜索框。粘贴卡密直接定位到卡（按摘要匹配）；粘贴 `sha256:` 机器码查看该电脑绑定的卡和旧版许可证；也可搜客户名、订单号。在页面空白处直接粘贴卡密或机器码也会打开查找。其他快捷键：`N` 生成卡密，`/` 聚焦卡密搜索，`Esc` 关闭弹窗。

**卡密详情**（点击任意一行打开右侧抽屉）：查看 / 复制卡密、按模板复制发货文案；编辑客户、渠道、订单号、备注；查看设备（首次激活、最近请求时间）与该卡激活记录；停用 / 恢复 / 删除。

- 卡密使用 160 位随机值，格式为 `LIC-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX`。数据库保存 SHA-256 摘要用于激活匹配，另保存一份 AES-256-GCM 密文（密钥由签名私钥经 HKDF 派生，绑定卡 ID）用于后台回看；每次查看或含卡密导出都记入操作日志。本功能上线前创建的卡没有密文，无法回看。更换签名密钥后旧密文无法解密。
- 每张卡只授权一个产品；同一机器重复激活返回同一份许可证，不消耗新名额；不同机器超过额度返回 409。默认设备上限 2，可设为 1–100；每批生成 1–100 张。
- 停用卡密后拒绝所有激活请求（包括已绑定机器的重新请求），恢复后继续使用原绑定记录。删除不可恢复，同时清理设备记录（激活日志保留）。批量操作以事务执行，不会部分成功。
- **释放设备名额**：客户换电脑时可在详情中释放某台设备，腾出名额供新电脑激活。离线许可证无法撤回，被释放的旧电脑仍可继续使用，因此需确认、记入操作日志，并在详情显示「已释放 N 次」。
- 当前许可证永久有效，不要求定期联网；停用或删除卡密不能撤回已签发的离线许可证。

升级时数据库只做增量迁移（新增列和表，旧卡按创建时间与参数自动归入批次），不会改写已有卡密、激活记录或签名。升级前仍建议在设置页下载备份。

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

错误响应统一为 `{"error":"说明","code":"机器可读代码"}`，客户端应按 HTTP 状态和 `code` 判断，`error` 文本仅供展示。激活接口的 `code`：`invalid_request`、`unknown_product`、`card_not_found`、`card_disabled`、`device_limit`、`rate_limited`。状态码：400 参数无效，403 卡密停用或来源不允许，404 卡密不存在或不属于该产品，409 设备额度已满，429 请求过多（遵循 `Retry-After`），500 服务内部错误。客户端应在收到成功响应且本地验签通过后原子保存 `license`；网络失败时可以重试，不能删除已有有效许可证。

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
| `GET /api/dashboard?tz=-480` | 概览：`totals`、按产品统计 `products`（unused/partial/full/disabled）、30 天 `trend`（`tz` 为 `Date#getTimezoneOffset()`） |
| `POST /api/lookup` | `{"query":"..."}`：按卡密、机器码、卡 / 激活 ID 或文本查找，返回 `{kind,cards,legacy}` |
| `POST /api/cards` | 创建单张：`productId`、`edition`，可选 `maxDevices`（默认 2）、`note`、`customer`、`channel`、`orderNo`；返回 201，含 `cardCode` |
| `POST /api/cards/batch` | 批量生成：上述字段加 `quantity`（1–100）；返回 201，`{items,total,batchId}` |
| `PATCH /api/cards/batch` | 批量停用 / 恢复：`{"cardIds":[...],"status":"disabled"}` |
| `DELETE /api/cards/batch` | 批量删除：`{"cardIds":["UUID"],"confirmed":true}`，1–100 个不重复 ID；任一不存在返回 404，整批不执行 |
| `GET /api/cards?q=&productId=&state=&batchId=&offset=&limit=` | 查询卡密（`state`：`unused`/`partial`/`full`/`disabled`/`active`，兼容旧参数 `status`；`limit` 1–100，默认 30） |
| `GET /api/cards/export?...&codes=1` | 按同样筛选导出 CSV；`codes=1` 包含卡密明文并记入日志 |
| `GET /api/cards/:cardId` | 详情，含 `devices`（`activationId`、`machineFingerprint`、`issuedAt`、`lastSeenAt`） |
| `PATCH /api/cards/:cardId` | 修改 `status`、`note`、`customer`、`channel`、`orderNo` 中任意字段 |
| `POST /api/cards/:cardId/reveal` | 解密返回 `{cardCode}`；旧卡返回 404 `code_unavailable` |
| `POST /api/cards/:cardId/devices/:activationId/release` | `{"confirmed":true}` 释放设备名额 |
| `GET /api/batches`、`GET /api/batches/:batchId` | 批次列表 / 详情（含 `cards`、`activatedCards`、`disabled`） |
| `PATCH /api/batches/:batchId` | `{"status":"disabled"}` 整批停用或恢复 |
| `GET /api/activation-log?cardId=&machine=&productId=&result=ok\|failed&offset=` | 激活记录 |
| `GET /api/audit-log?offset=` | 后台操作日志 |
| `GET /api/settings`、`PUT /api/settings` | 产品显示名 / 颜色、发货模板（变量 `{cardCode}` `{product}` `{edition}` `{maxDevices}` `{customer}`）、生成预设 |
| `GET /api/backup` | 下载数据库一致性快照（`VACUUM INTO`） |
| `/api/licenses`、`/api/licenses/:licenseId` | 保留旧 PhotoArchiver 单机 PA1 签发、查询和归档行为 |
