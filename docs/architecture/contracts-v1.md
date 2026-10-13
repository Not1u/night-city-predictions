# 共用接口 v1.0 · 第一阶段冻结

类型与路由的唯一事实来源是 `packages/contracts/src/index.ts`；可运行 mock 资料在同目录的 `fixtures.ts`。任务书中的“AI 1–4”是模块分工说明，本次由一个实现流程统筹，未向其他会话发送任何消息。

## 统一约定

- 基础路径 `/api/v1`。所有响应携带 `meta.server_time`（UTC ISO、固定毫秒、Z 后缀）、`request_id`、`api_version`。前端据服务端时间校正倒计时，服务端在实际写入时重新判定。
- 积分为整数；单次输入 1–1,000,000,000；总额与钱包上限也必须在正式服务中约束。比例用 `numerator/denominator` 表示，UI 最后格式化；支付中间运算使用 BigInt，不能先做浮点乘除。
- 每日签到暂统一为 **UTC 自然日**，一日一次 50 €$；这是对任务书“服务端日期”的明确化，不受访问者时区影响。前台必须提示。
- 列表为 `{items,next_cursor}`；动态列表默认 20、最多 100，游标使用 `(created_at,id)` 倒序键集分页并绑定查询对象，禁止用 offset 作为稳定游标。当前只读轮次与角色集合有界，返回完整列表，游标为 null；动态分页在对应模块实现。
- 会话 cookie：`__Host-nc_session`，Secure、HttpOnly、SameSite=Lax、Path=/，至少 256 位随机令牌，只存 SHA-256 摘要；服务端检查到期与撤销。令牌发放/OIDC 回调仍待实现，无测试后门。正式登录需校验 state、nonce、PKCE、签名、issuer 和 audience。
- 修改积分必须提供 8–128 字符 `Idempotency-Key`。唯一作用域 `(user_id,key)`；重复键同 method/path/body 返回原响应，内容变化返回 409 `IDEMPOTENCY_CONFLICT`。业务记录、余额变化、流水、请求结果必须在同一事务中提交；一期尚未实现该资金写入事务。
- 管理员所有敏感写操作必须带 `X-Admin-Step-Up`。证明与会话、动作、目标、规范化请求体哈希绑定，5 分钟内有效且只消费一次，业务、审计与消费必须原子提交。不能把字符串确认弹窗当二次验证。
- 事件 `schema_version=1`，每轮 `sequence` 单调递增；断线或版本缺口必须重新读取 API 快照。当前未实现推送。

## 样例

GET `/rounds`（公开）：

```json
{"data":{"items":[{"id":"episode-01","episode":1,"title":"第一集","status":"draft","opens_at":null,"closes_at":null,"previous_round_id":null,"pool_total":0,"participant_count":0}],"next_cursor":null},"meta":{"server_time":"2026-10-13T12:00:00.000Z","request_id":"req-example","api_version":"v1"}}
```

GET `/rounds/:id/characters`：`Page<RoundCharacter>`；GET `/rounds/:id/odds`：`Page<CharacterOdds>`。

```json
{"character_id":"weak","stake_total":0,"participant_count":0,"opening_reference":{"numerator":1,"denominator":1},"live_reference":null}
```

POST `/check-ins`：登录 + 幂等键，无请求体；响应 `CheckInResponse`，含 reward、UTC date、wallet 和 ledger。

POST `/rounds/:id/predictions`：登录 + 幂等键，请求 `{"character_id":"weak","amount":10}`；响应 `PredictionResponse`，含 prediction 和 wallet；新订单 `payout:null`，不保存“锁定赔率”。

GET `/me`：`Me`；GET `/me/ledger?cursor=...&limit=20`：`Page<LedgerEntry>`；GET `/me/predictions?round_id=...`：`Page<Prediction>`；均需登录。

GET `/characters/:id/comments`：`Page<Comment>`；POST 同路径：`{"body":"我对这个角色的预测…"}`，返回 `Comment`。登录、1–500 字符、频率与内容过滤在服务端。POST `/comments/:id/reports`：`{"reason":"spoiler","detail":"含未标注剧情"}`，返回 `{"id":"report-id","status":"pending"}`。一期仅模拟，本地举报不发送管理员。

认证：GET `/auth/session` 返回 `User`；POST `/auth/logout` 撤销会话（待实现）。管理员 POST `/admin/auth/step-up` 输入 `StepUpRequest`，输出 `StepUpResponse`；实际验证方式在第二阶段选定。

管理员契约：

| 方法 / 路径（前缀 /admin） | 请求 | 响应 |
|---|---|---|
| GET /rounds | 分页参数 | Page<Round> |
| POST /rounds | AdminRoundRequest | Round |
| PATCH /rounds/:id | opens_at, closes_at, title | Round |
| POST /rounds/:id/characters | character_ids: string[] | Page<RoundCharacter> |
| POST /rounds/:id/open | {} | Round |
| POST /rounds/:id/close | {} | Round（同时冻结快照） |
| POST /rounds/:id/deaths | AdminDeathRequest | DeathResult |
| POST /rounds/:id/settle | {} + 幂等键 | Settlement |
| GET /rounds/:id/next-candidates | 无 | Page<RoundCharacter> |
| POST /characters | AdminCharacterRequest | Character |
| PATCH /characters/:id | Partial<AdminCharacterRequest> | Character |
| DELETE /comments/:id | reason: string | id, status: hidden |
| GET /reports | 分页参数 | 举报分页 |
| PATCH /reports/:id | status: resolved/dismissed | 更新后的举报 |
| GET /audit | 分页参数 | Page<AuditEntry> |
| POST /rewards | user_id, amount, reason + 幂等键 | LedgerEntry |
| POST /uploads | 待授权素材方案 | 预留，503 FEATURE_NOT_READY |

所有管理员写入均为 step_up，读取为 admin。小游戏与实时弹幕只预留目录规划，**未承诺可用接口**。

错误统一为 `{"error":{"code":"ROUND_CLOSED","message":"本轮已封盘"},"meta":{...}}`。认证失败 401、权限/二次验证 403、未知对象 404、非法输入 400、余额/重复签到/幂等冲突/重复结算/轮次冲突 409、限流 429、未接入 503、内部故障 500。错误码全集见 TypeScript 定义。不得将内部数据库错误或敏感字段返回给客户端。

## 三类数值

1. `opening_reference` 是继承的展示参考，首轮 1/1。
2. `live_reference` 是本集 P/S；S=0 时为 null，展示回退到 opening_reference。
3. `Prediction.payout` 是结算后实际整数返还，未结算为 null。多个死亡角色统一以 W 为分母，绝不逐角色重复分配 P。

后续变更：小改追加字段保持兼容；修改支付或生命周期必须更新本文件、类型、mock、API 和测试后再接入。
