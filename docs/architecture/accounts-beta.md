# 邮箱账户试营业 · 2026-10-14

前台继续部署在 GitHub Pages，使用 Appwrite Email OTP（6 位码及安全短语）注册/登录。登录、会话存储及退出由官方 Web SDK 管理；前端仅在内存中缓存短期 JWT，本站不保存密码或验证码。

账户请求携带 `Authorization: Bearer`。Workers 每次向固定的 Appwrite 项目验证 JWT，检查账户启用及邮箱验证状态，不接受前端传入的 user_id、role、余额。会话撤销后验证立即失败。本站 D1 只保存 provider_subject、随机公开昵称、角色、年龄/积分说明确认版本，不复制邮箱。

`POST /api/v1/auth/register` 接受 `{ "consent": true }`，同一邮箱对应的 provider_subject 幂等建立零余额钱包和 user 角色。验证邮箱后才能登记；无默认管理员或角色提升入口。

当前开放 `GET /me`、`POST /check-ins`、`GET /me/ledger`、`GET /me/predictions`。签到按服务端 UTC 日期，每次 50，使用 D1 batch 事务和每日唯一约束；钱包、流水、签到和幂等响应原子保存。重试原请求键返回原响应，不再次入账。前台账单当前显示最近 100 条。

轮次保持 draft，没有硬编码首播时间、开放预测或结算。API 模式的留言入口说明暂未开放，不会把本地留言展示成公共社区。localStorage 演示账户不导入线上，不发初始积分。

## 服务

- 前台：https://not1u.github.io/night-city-predictions/
- 后端：https://night-city-api.night-city-predictions.workers.dev
- Appwrite：项目 `6ace5d2d0013cced1e83`，新加坡；Web host 为 `not1u.github.io`，不是 `*`。
- D1：night-city-production，仅数据库绑定在后端；前台参数均为公开地址/项目 ID。
- Cloudflare 另建的 night-city-service Pages 项目仅为域名故障排查预留，未部署、未用于运行网站。

运行 `npm run check` 验证账户、权限、重复签到、用户隔离、事务回滚。后端发布：`npx wrangler deploy --config apps/api/wrangler.production.jsonc`。前台推送 main 自动发布，环境参数见 GitHub workflow。生产迁移：`npx wrangler d1 migrations apply night-city-production --remote --config apps/api/wrangler.production.jsonc`。

若邮件服务额度、限流或投递失败，页面保留邮箱/验证码步骤并显示错误，不能把发送请求成功当成邮件已送达的证明。扩大量前应继续验证目标用户邮箱的实际投递情况。
