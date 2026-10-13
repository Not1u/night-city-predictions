# 网站管理说明

更新：2026-10-14。本说明对应当前公开测试版。

## 目前有哪些管理入口

独立管理后台目前只有框架，尚未实现管理员登录、二次验证、正式开封盘及结算操作；不存在可直接使用的默认管理员账号。不要把本地管理页当成已上线的运营后台。

日常内容通过 GitHub 更新，账户由 Appwrite 管理，服务和数据库由 Cloudflare 管理。它们使用站长的平台账号，普通访客没有这些权限。

## 修改公告和开播日期

打开 [公告数据文件](https://github.com/Not1u/night-city-predictions/blob/main/apps/web/src/content/announcements.json)，登录 GitHub 后点铅笔编辑。

1. `lastReviewed`：这次实际核对官方原文的日期，例如 `2026-10-14`。
2. `schedule.date`：官方当前公布的日期，格式 `YYYY-MM-DD`；未知时改为空字符串，页面显示“待官方确认”。
3. `schedule.note`：补充时间、地区差异或延期说明；`sourceUrl` 指向支持该日期的官方原文。
4. `items`：公告列表，每条包含标题 `title`、用自己的话写的短摘要 `summary`、来源 `source`、原文地址 `url`、原文发布日期 `publishedAt`。官网入口没有单篇发布日期时填 `null`。
5. 保存修改并提交到 `main`，在 [发布记录](https://github.com/Not1u/night-city-predictions/actions) 等待绿色成功，再刷新网站。

保留 JSON 的引号、逗号和括号。当前来源仅允许 HTTPS 官方域名：cyberpunk.net、cdprojekt.com、cdprojektred.com（代码中列出的 www / press 子域名）及 www.netflix.com。新增来源需先调整校验名单。构建失败不会替换上一个成功版本。

公告现在是人工核对维护，不是自动抓取，也不会自行跟踪延期。只写上线日期等简短事实并链接原文；不搬运完整新闻、剧照、配乐或剧情。原文也可能含预告及剧透，页面已有提示。

**公告日期仅用于展示，不会改变任何轮次，不会自动开放预测、封盘或结算。**

## 测试场和正式开播安排

目前 `beta-sandbox` 是可退款的预测测试场，正式 `episode-01` 仍未开盘。测试场有自己的截止时间，不依赖公告日期；延期前应分别检查公告和测试场截止时间。

Cloudflare 控制台 → Workers & Pages → `night-city-api` 查看后端状态；Storage & Databases → D1 → `night-city-production` 查看数据。`rounds` 表的 `opens_at`、`closes_at` 为 UTC 时间（北京时间减 8 小时）。可在控制台只读查询：

```sql
SELECT id, title, status, is_test, opens_at, closes_at FROM rounds;
```

正式运营前仍需完成：站长身份与二次验证、开封盘控制、结果复核、幂等结算、审计与恢复验证。当前不要通过手改余额、订单、彩池或结算记录来模拟中奖；这些数据彼此有关联。需要延长测试、退款或调整轮次时，应做带条件检查和审计的维护变更。还没有可交给非技术管理员的一键正式结算功能。

## 账户和昵称

在 [Appwrite 项目](https://appwrite.io/projects/6ace5d2d0013cced1e83/overview) 的 Auth / Users 查看注册账户、停用账户和撤销会话。使用 Appwrite 原生控制台完成这些操作。本站昵称保存在 D1 的 `users.display_name`，用户可在网站点击自己的账户修改；Appwrite 的名称字段不是本站昵称来源。

本站数据库不把邮箱放进公开榜单。不要直接删除有积分流水的 D1 用户记录，也不要手动修改钱包来发奖。停用账户与撤销现有会话是两个不同动作，应按平台界面确认。

## 获奖榜和留言

- “大乐透”：已正式结算轮次的累计总返还减去全部投入，排除测试场及取消订单，只展示正收益玩家前 10 名。
- “游艺厅”：近 30 天所有游戏的总返还减去全部投入，只展示正收益玩家前 10 名。
- 公示用户名、净收益和盈利记录数，不展示角色、剧情或邮箱。没有真实记录时显示空榜，不填假中奖者。
- 所有公开和角色留言入口已删除，旧留言读取、发布、删除、举报接口统一返回关闭状态。历史数据未作破坏性清库，不再通过这些接口公开。没有留言审核工作需要日常维护。

## 机台和图标

轮盘和老虎机的结果由后端确定，3D 动效只呈现结果。此次没有修改概率、奖表、积分规则或历史订单。每台有“试看动效 · 不扣积分”，便于检查视觉效果。

旧 N 是本站自制的 Night City 首字母图形，不是官方电台标识。新版广播标和银臂摇滚、企业高塔、巡逻盾徽、神经芯片均为原创 SVG，没有采用官方电台、NCPD、荒坂或角色商标。

[CD PROJEKT RED 粉丝内容指南](https://www.cdprojektred.com/en/fan-content) 对游戏及应用等另有限制，不能从允许粉丝网站推导出允许将官方品牌用于本站小游戏。当前的摘要和原创图标减少了复制素材的范围，不构成整个网站已获得授权的保证。既有官方角色图及视频的来源记录保留在 `docs/architecture/asset-sources.md`；商业化或扩大使用前应另外处理授权。

## 发布和回退

前台推送 GitHub `main` 后自动部署到 Pages。后端修改需要另行部署 Worker，前台发布不会替代这一步。当前改版没有新增数据库迁移。

```powershell
npm run check
npx wrangler deploy --config apps/api/wrangler.production.jsonc
```

前台回退使用 GitHub 的还原提交，再等自动发布。后端回退用 Cloudflare Worker 部署历史，并注意与数据库兼容。不要公开 `.env`、登录凭证、API 密钥、邮箱列表或数据库导出文件。
