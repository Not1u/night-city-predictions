# 官网风格与素材记录

用户在 2026-10-13 明确要求参考 https://www.cyberpunk.net/zh-cn/edgerunners2 的动效、风格，并使用其中的角色图片。本次采用其公开页面中实际观察到的图片地址，没有把用户的使用要求表述为权利人的授权。

## 使用方式

- 10 张角色 PNG 和封面 JPG 已保存到 `apps/web/public/assets/edgerunners2/`，总计约 0.6 MB，构建会自动复制。
- 动画背景引用官网 CDN 的 MP4，不复制或修改视频内容。
- 素材映射集中在 `apps/web/src/official-assets.ts`，API 返回自定义 image_url 时优先使用 API 值。
- 产品名称、导航、预测 UI、账本与互动逻辑仍由本项目实现。没有复制官网导航菜单、合作品牌标识、订阅表单或追踪脚本。
- 页脚明确标示非官方与素材归属，并链接到来源。
- 若需要重新下载，运行 `powershell -File scripts/download-reference-assets.ps1`；脚本只下载以下精确来源，已有文件不会覆盖。

## 图片原始地址

公共前缀：`https://www.cyberpunk.net/build/images/edgerunners2/`

| 本地文件 | 官网相对地址 |
|---|---|
| cover.jpg | cover-pc-81ae3e53.jpg |
| weak.png | characters/weak-d06b35b1.png |
| d.png | characters/d-b06a2e35.png |
| roman.png | characters/roman-7104f5a9.png |
| talia.png | characters/talia-f6ecd1a0.png |
| avida.png | characters/avida-05ced57c.png |
| sal.png | characters/sal-3723999b.png |
| jessie.png | characters/jessie-764047b0.png |
| kitano.png | characters/kitano-57873497.png |
| richard.png | characters/richard-bb9af5a2.png |
| kiril.png | characters/kiril-516a2d43.png |

视频：`https://cdn-l-cyberpunk.cdprojektred.com/video/CPER2_landing_page_vid_FIN_1920x1080_h264.mp4`

## 动效与降级

桌面默认静音循环背景视频；离开首屏或标签页不可见时暂停。手机宽度 ≤780、prefers-reduced-motion 或 Save-Data 默认停用自动视频。开关同步暂停视频、字幕条、标题/按钮动效。系统减少动态效果优先禁用 CSS 动画。所有素材仅用于当前本地演示改版，未进行上线部署。

按钮短暂错位切片、角色悬停缩放、档案弹窗与滚动进入均为本项目 CSS/JS 实现，没有复制官网业务脚本。
