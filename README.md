# 夜城命运档案

《赛博朋克：边缘行者 2》非官方、非盈利粉丝预测站。18+；夜城欧元是无现实价值的虚拟积分，不支持充值、提现、兑换、转让或交易。

## 当前交付：第一阶段

已建立 TypeScript 单仓、v1 接口契约、D1 迁移、会话校验骨架、只读 Workers API、响应式前台演示和管理员空壳。**这不是已经完成的可公开运营版本。** 真实登录、签到、扣款、结算、管理二次验证、社区审核在下一阶段实现。前台默认的模拟操作只保存在浏览器，不能作为服务端账本。

## 启动

需要 Node.js 22.13+（建议 24 LTS）、npm。首次安装需要网络；本地开发不需要 Cloudflare 账户。

```powershell
npm install
npm run dev
```

打开终端显示的本地地址，默认 http://127.0.0.1:5173 。点击“进入演示账户”，确认 18+ 后签到领取 50 €$，即可模拟预测、查看本集订单、积分流水、留言和举报标记。演示没有结算按钮，不伪装已经接通正式支付。

## 视觉改版（2026-10-13）

按用户指定的中文官网调整为全屏动画首屏、黄色实心/描边标题、切角按钮、红色角色档案与滚动入场。10 张官方角色立绘与封面已保存到本地素材目录；背景视频使用官网 CDN。点击角色立绘可展开档案，原有模拟操作保持可用。

手机、节省流量模式与系统减少动态效果默认不自动加载视频；用户可用首屏开关播放/暂停动效。视频不可用时保留本地封面。素材来源见 [素材记录](docs/architecture/asset-sources.md)。官方素材不属于项目原创，也不表示官方合作或背书。

如默认端口被本机系统占用或拒绝，可运行 `npm run dev -- --port 5180`。浏览器模拟数据按访问地址隔离，不同端口的演示钱包不会自动共享。

另开终端启动 API / 管理端：

```powershell
npm run db:migrate
npm run dev:api
# 另一个终端
npm run dev:admin
```

API 默认 http://127.0.0.1:8787 ，管理员框架默认 http://127.0.0.1:5174 。本地迁移只创建资料与未开盘首轮，不赠送积分、不创建默认管理员。Wrangler 配置中的全零数据库 ID 是占位符，部署前必须替换。

## 切换数据源

在 `apps/web/.env.local` 写入下列内容，重启前台。此模式读取真实本地 D1，但写入功能保持关闭：

```dotenv
VITE_DATA_MODE=api
VITE_API_BASE_URL=http://127.0.0.1:8787
```

默认 `VITE_DATA_MODE=mock`。模拟状态使用 localStorage 的 `night-city-demo-v1`；清除此项即可重置。模拟账户、留言、请求键不支持跨设备同步或跨标签并发保证。正式版必须以服务端为准。

## 验证与构建

### GitHub Pages 演示站

仓库包含 GitHub Pages 自动发布配置。仓库的 Settings → Pages → Source 设为 **GitHub Actions** 后，每次推送 `main` 都会检查代码、运行测试并发布前台。也可以在 Actions 手动运行发布。

本地运行 `npm run build:pages` 可生成相同的发布文件，输出在 `apps/web/dist`。图片和脚本使用相对路径，支持 GitHub 仓库子路径以及后续绑定独立域名。发布内容仅包含前台演示；管理端、数据库和 Worker 不会部署到 Pages。

线上演示的数据仍保存在访问者自己的浏览器中，不共享账户、钱包或留言。GitHub Pages 不运行本项目的后端，真实登录和公共数据需要后续单独部署 API 与数据库。

### 本地检查

```powershell
npm run check
npm run build
npm run build:api
```

测试覆盖数据库约束、会话与角色权限、只读接口、模拟签到/请求重试/余额检查/轮次隔离。**这些不等于正式并发资金结算测试通过**，真实资金服务未实现。

## 目录

- `apps/web`：前台、CSS 原创视觉、模拟与 HTTP 数据适配层。
- `apps/api`：Cloudflare Worker、D1 绑定、会话校验。
- `apps/admin`：独立管理端启动骨架。
- `packages/contracts`：类型、路由注册表、错误码、样例数据。
- `db/migrations`：结构与初始角色资料。
- `tests`：基础自动检查。
- `docs/architecture`：接口冻结、生命周期、安全边界与交接。

后续安排见 [阶段进度](docs/architecture/progress.md)。
