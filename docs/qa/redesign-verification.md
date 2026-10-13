# 官网视觉改版验收

2026-10-13 / 本地演示环境。参考 https://www.cyberpunk.net/zh-cn/edgerunners2 。

## 完成

- 官方角色立绘 10 张及首屏封面保存到本地，图片文件头检查通过。
- 首屏官方 CDN 视频实际播放成功：readyState=4，paused=false，播放时间前进。
- 黄色实心/描边大标题、切角按钮、红黑档案卡片、斜纹背景、滚动字幕条。
- 滚动入场、角色悬停缩放、按钮短暂故障切片、档案弹窗。
- 暂停动效开关验证：data-motion=off、video.paused=true、开关文字变为“播放动效”。
- 手机 390×844：默认不设置视频 src，无自动视频下载；scrollWidth=clientWidth=375。
- 桌面 1440×1080：三列角色布局，scrollWidth=clientWidth=1425；10 张角色立绘全部加载成功。
- 手机筛选新团队 4 名、关联角色 6 名；基里尔档案正常显示。
- 改版后演示流程：进入账户 → 签到 +50 → 预测 -10 → 余额 40，流水与订单正确。
- 控制台没有记录到错误。
- `npm run check`：类型检查和 14 项测试通过。
- `npm run build`：前台和管理员应用构建通过。

## 截图

- `redesign-hero.png`：新首屏（暂停画面）。
- `redesign-characters.png`：角色立绘与预测卡片。
- `redesign-mobile.png`：手机首屏与暂停/播放入口。

开发预览使用 5180 端口，因本次环境拒绝绑定 5173。启动命令：`npm run dev -- --port 5180`。本次未改变资金规则、数据库或正式账户/结算的完成状态，仍为本地演示。
