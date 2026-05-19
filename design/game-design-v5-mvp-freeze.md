# 🤖 AI驱动高自由度 Web JRPG 游戏开发计划书 V5 MVP 冻结版

## 1. 文档目的

本文档是 `design/game-design-v5.md` 的 **MVP 冻结版**。  
其目标不是继续扩展长期蓝图，而是将项目收敛为一份 **可直接进入实现排期与开发执行** 的规范。

本文档优先解决以下问题：

- MVP 与长期方案边界不清
- 变量模型存在多种解释
- assistant 消息正式化边界不唯一
- `trigger_battle` 工具契约存在残留字段与旧命名
- Checkpoint / Event Log / Save Snapshot 职责存在重叠
- 战斗系统与 Prompt Builder 有过度设计风险

本冻结版生效后，MVP 实现必须以本文为准；原 V5 文档中与本文冲突的部分，**以本文为准**。

---

## 2. MVP 目标

MVP 的目标是完成以下核心玩法闭环：

```text
用户输入
  → AI 生成剧情文本
  → AI 触发受限工具调用
  → 本地引擎执行变量更新或触发战斗
  → 战斗在本地规则系统中完成
  → 结果持久化并写入聊天历史
  → 玩家点击“继续剧情”
  → AI 基于结果继续叙事
```

MVP 必须满足以下三个条件：

1. **可玩**：玩家可以从新游戏开始，进入至少一条完整的剧情-战斗-续写循环。
2. **一致**：聊天正式提交、变量更新、战斗结算之间不能出现“只成功一半”的状态。
3. **可恢复**：请求失败、工具调用失败、刷新页面、写库失败等场景有明确恢复路径。

---

## 3. MVP 范围

## 3.1 纳入 MVP 的能力

### 3.1.1 基础运行能力

- Vue 3 + Pinia + Vite 前端壳
- SQLite Wasm + OPFS 本地数据库
- 独立 DB Worker
- IndexedDB 保存用户配置
- 单存档槽 + 自动存档能力
- 完整存档导出

### 3.1.2 会话与状态机

MVP 固定支持以下 `SessionState`：

- `IDLE`
- `GENERATING`
- `COMBAT_PENDING`
- `IN_COMBAT`
- `POST_COMBAT_READY`
- `ERROR_RECOVERY`

MVP 固定支持以下 `PipelineState`：

- `PROMPT_BUILDING`
- `STREAMING_TEXT`
- `VALIDATING_TOOLS`
- `EXECUTING_COMMANDS`
- `PERSISTING_CHECKPOINT`
- `ROLLING_BACK`

### 3.1.3 AI 对话闭环

- 用户输入消息提交
- 单 Provider 流式响应
- assistant provisional message
- Tool Call Schema 校验
- Tool Call → `DomainCommand`
- Engine 执行命令
- 关键提交 `commitAck`
- assistant message finalized
- 错误恢复、重试、回滚

### 3.1.4 变量系统 MVP

- 固定变量定义集
- 根变量树存储
- 白名单子路径 Patch
- JSON Schema 校验
- 变量变更日志
- 变量快照注入 Prompt

### 3.1.5 战斗系统 MVP

- `trigger_battle`
- story 模式战斗
- Press Turn 核心规则
- 敌人 / 技能 / 物品最小模板集
- 战斗日志
- `BattleResult`
- 战斗摘要系统消息
- 半自动续写

### 3.1.6 持久化与恢复

- `chat_history`
- `variable_def`
- `variable_value`
- `variable_change_log`
- `enemy_def`
- `skill_def`
- `item_def`
- `world_info`
- `event_log`
- `checkpoint_snapshot`
- `save_meta`
- 自动存档
- 战斗恢复或安全回滚
- 存档导出

---

## 3.2 明确不纳入 MVP 的能力

以下能力全部后置，不得在 MVP 实现阶段反向膨胀需求：

- 双 API 模式
- 异步历史总结
- Hard / Retrieval / Optional 的完整执行框架
- 高级模板宏语法
- Token 精细预算系统
- 多 Provider 深适配
- Combo Skills
- 复杂 Modifier 注册表
- `training / challenge / simulation` 模式
- 自定义歌单
- 完整资产管理 UI
- 商店系统
- 训练场
- 时间旅行调试
- SillyTavern 深兼容
- 动态变量定义编辑器
- 移动端战斗深度优化

MVP 只允许保留这些能力的**扩展接口**，不要求其功能可用。

---

## 4. 架构冻结

MVP 采用以下分层架构：

1. **表现层（UI / View Layer）**
2. **游戏引擎层（Game Engine）**
3. **AI 编排层（AI Orchestrator）**
4. **数据持久层（Data Access / Worker）**

### 4.1 分层边界

- UI 只能调用 Store / Action / Facade，不得直接操作数据库
- Orchestrator 不得直接修改 Pinia 或 SQLite
- 所有状态变更必须转为 `DomainCommand`
- 所有持久化写入必须经由 Engine → Repository / Worker
- 主线程不得直接访问 SQLite

### 4.2 MVP 核心运行时组件

```text
Session Manager
AI Orchestrator
Command Bus / Engine Facade
Checkpoint Manager
Persistence Gateway
DbWorkerClient
```

---

## 5. 状态机冻结

## 5.1 SessionState

### `IDLE`

允许：

- 发送消息
- 查看状态
- 打开允许的基础 UI

进入条件：

- 系统无 active request
- 不在战斗中
- 无恢复流程占用

### `GENERATING`

允许：

- 读取型操作
- 中止请求

禁止：

- 发起第二个 AI 请求
- 打开会修改状态的业务模态
- 进入战斗外业务写操作

### `COMBAT_PENDING`

表示：

- AI 已合法触发战斗
- 玩家尚未正式进入战斗

允许：

- 查看敌人信息
- 做有限的战前整理（如 MVP 已实现）

### `IN_COMBAT`

表示：

- 本地战斗流程运行中

禁止：

- 所有 AI 编排任务继续前进
- 发起新的剧情请求

### `POST_COMBAT_READY`

表示：

- 战斗结果已提交
- 战斗摘要已写入
- 等待玩家点击“继续剧情”

### `ERROR_RECOVERY`

表示：

- 请求失败
- 工具失败
- 持久化失败
- 上下文绑定失效
- 需要用户重试 / 编辑 / 回滚

---

## 5.2 PipelineState

MVP 支持以下内层状态：

- `PROMPT_BUILDING`
- `STREAMING_TEXT`
- `VALIDATING_TOOLS`
- `EXECUTING_COMMANDS`
- `PERSISTING_CHECKPOINT`
- `ROLLING_BACK`

说明：

- MVP 中不单独保留 `WAITING_TOOL_CALLS`
- 工具收集逻辑视为 `STREAMING_TEXT` 结束时的一部分
- 工具验证统一进入 `VALIDATING_TOOLS`

---

## 5.3 单请求约束

MVP 强制：

- 同一时刻只允许一个 active request
- `GENERATING` 状态下不能再发送第二个请求
- `IN_COMBAT` 状态下 AI 编排流程必须暂停
- 所有 Tool Call 必须绑定当前 request 生命周期

---

## 6. 聊天消息生命周期冻结

## 6.1 消息模型

MVP 领域层消息模型最少包含：

```ts
interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  kind: 'normal' | 'battle_summary' | 'failed_draft'
  content: string

  user_visible: boolean
  ai_visible: boolean

  provisional: boolean
  finalized: boolean
  failed: boolean

  request_id?: string
  context_version?: number
  tool_call_id?: string

  created_at: string
}
```

说明：

- `history_summary`
- `system_log`
- `generated_by`
- `summary_version`
- `updated_at`

这些字段可后置，不属于 MVP 必须字段。

---

## 6.2 唯一正式化规则

assistant 消息的唯一正式化条件为：

> **本轮请求的全部关键命令执行成功，且对应关键持久化写入收到 `commitAck` 后，assistant provisional message 才可 finalized。**

该规则是 MVP 唯一合法解释。

---

## 6.3 生命周期规则

### 用户消息

用户消息提交后直接进入正式历史：

- `provisional = false`
- `finalized = true`
- `failed = false`

### assistant 消息

流式阶段先写入 provisional buffer：

- `provisional = true`
- `finalized = false`
- `failed = false`

当关键写入全部成功并收到 `commitAck` 后：

- `provisional = false`
- `finalized = true`
- `failed = false`

### failed draft

若请求中断、工具调用非法、命令执行失败或持久化失败，则 assistant 消息进入 failed draft：

- `kind = 'failed_draft'`
- `provisional = false`
- `finalized = false`
- `failed = true`

---

## 6.4 MVP 产品策略

MVP 固定采用：

- **默认保留 failed draft**
- 用户可选择：
  - 重试
  - 编辑后重试
  - 回滚到最近 checkpoint

---

## 6.5 关键提交定义

以下写入属于 MVP 关键提交：

- assistant 消息正式写入 / 更新
- 变量写入
- 战斗结果写入
- 战斗摘要系统消息写入
- encounter 关闭写入
- `save_meta.last_save_time` 更新

未收到 `commitAck` 前，这些状态均不得视为正式成功。

---

## 7. 变量系统冻结

## 7.1 变量模型

MVP 采用 **根变量树 + 子路径 Patch** 模型。

### 根变量建议集合

- `player`
- `inventory`
- `world`
- `flags`
- `party`
- `system`

每个根变量在 `variable_value` 中存一整棵 JSON 值。

示意：

```json
{
  "player": {
    "name": "雷伊",
    "level": 1,
    "hp": 120,
    "mp": 40
  }
}
```

---

## 7.2 数据库存储

### `variable_def`

用于定义根变量的元数据：

- `id`
- `category`
- `schema`
- `access_level`
- `default_value`
- `description`
- `updated_at`

### `variable_value`

用于存储根变量当前值：

- `var_id`
- `value_json`
- `updated_at`

### `variable_change_log`

用于记录每次变更：

- `id`
- `timestamp`
- `var_id`
- `old_value`
- `new_value`
- `source`

---

## 7.3 校验链冻结

MVP 统一采用三层校验：

1. **Tool / Command 输入校验**：Zod
2. **变量树结构校验**：JSON Schema validator
3. **业务规则校验**：Engine 自定义规则

强制说明：

- Zod 不负责变量最终值结构
- JSON Schema 不负责业务语义
- 业务规则不下沉到数据库触发器中

---

## 7.4 Patch 规则

MVP 变量更新方式：

- 对根变量内部子路径执行 JSON Patch
- 仅允许白名单路径
- Patch 应用后，必须对更新后的整棵根对象执行 JSON Schema 校验
- 通过后方可进入事务写入

---

## 7.5 权限规则

AI 只允许写入经白名单开放的路径。

### 示例

可写：

- `/flags/campfire_lit`
- `/world/current_location`
- `/inventory/items/herb/count`

只读：

- `/player/hp`
- `/player/mp`
- `/player/level`

隐藏：

- `/system/api_keys`
- `/system/debug_flags`

---

## 8. Tool Calling 冻结

## 8.1 MVP 允许的工具集合

MVP 仅允许以下工具进入正式实现闭环：

- `trigger_battle`
- `update_variables`

以下工具不属于 MVP：

- `set_bgm`
- 复杂系统日志工具
- 任意开放式状态 Patch 工具
- 非白名单业务工具

---

## 8.2 Tool Execution Envelope

所有 Tool Call 必须在执行前绑定以下上下文：

- `request_id`
- `context_version`
- `state_hash`
- `tool_call_id`
- `tool_name`
- `args`
- `issued_at`

---

## 8.3 执行链冻结

MVP 统一工具执行链：

1. Zod Schema 校验
2. 工具白名单校验
3. FSM 状态校验
4. 上下文绑定校验
5. 幂等校验
6. 转 `DomainCommand`
7. Engine 执行
8. 等待关键写入 `commitAck`
9. finalized / 失败恢复

---

## 9. `trigger_battle` 契约冻结

## 9.1 最终参数结构

MVP 中 `trigger_battle` 的唯一合法参数如下：

```ts
{
  encounter_id: string
  enemies: Array<{
    enemy_id: string
    count: number
  }>
  modifiers?: string[]
  narrative_reason: string
}
```

---

## 9.2 移出 MVP 的字段

以下字段不允许在 MVP 中实现：

- `enemy_group_id`
- `level_policy`

若未来恢复，必须通过 Post-MVP 设计文档重新引入。

---

## 9.3 参数约束

- `encounter_id` 必填
- `encounter_id` 在 story 模式下必须幂等
- `enemies` 至少包含 1 个敌人条目
- `enemy_id` 必须存在于本地 `enemy_def`
- `count` 必须为正整数，建议范围 `1 ~ 4`
- `modifiers` 默认为空数组或不传
- `narrative_reason` 仅用于审计与调试，不参与业务计算

---

## 9.4 幂等规则

在 story 模式下：

- 同一 `encounter_id` 成功触发并结算后，不允许再次成功触发
- 重复调用应被视为幂等拒绝
- 重复 tool_call 不得重复结算奖励或再次进入战斗

---

## 10. Prompt Builder 冻结

## 10.1 MVP Prompt Pipeline

MVP Prompt Builder 只保留以下步骤：

1. 读取固定 system prompt
2. 读取最近若干轮 `ai_visible` 聊天历史
3. 读取命中的基础 `world_info`
4. 读取状态快照并序列化为变量块
5. 注入可用工具定义
6. 生成 `request_id` / `context_version` / `state_hash`
7. 发起模型请求

---

## 10.2 MVP 世界书检索策略

MVP 采用简化版世界书检索：

- 根据最近用户输入做关键词包含匹配
- 根据 `priority` 排序
- 取前 N 条进入 Prompt
- 记录命中与丢弃原因即可

MVP 不要求：

- FTS
- 异步总结
- cache hit 分析
- 高级注入分类执行器

---

## 10.3 状态注入格式

MVP 将可见变量序列化为结构化文本块，推荐 YAML 风格：

```yaml
游戏状态快照:
  角色名称: 雷伊
  等级: 3
  HP: 120/120
  MP: 40/40
  当前地点: 校园后山
  背包:
    药草: 2
```

---

## 11. 战斗系统冻结

## 11.1 战斗模式

MVP 仅支持：

- `story`

以下模式全部后置：

- `training`
- `challenge`
- `simulation`

---

## 11.2 Press Turn 核心规则

MVP 保留以下核心规则：

- 回合开始获得行动图标
- 命中弱点时当前普通图标转闪烁图标
- 暴击按弱点收益处理
- Pass 优先消耗闪烁图标
- Miss 扣除两个图标
- 无效扣除两个图标
- 吸收 / 反射清空剩余图标
- 图标耗尽或全员无法行动时结束回合

---

## 11.3 暂不进入 MVP 的战斗扩展

以下内容不允许挤入 MVP：

- Combo Skills
- 复杂 Modifier Hook 系统
- 被动规则覆盖型装备体系
- 多战斗模式差异逻辑
- 战斗专属 BGM 特判

---

## 11.4 BattleResult

MVP 中战斗结果必须标准化为 `BattleResult`，至少包含：

- 胜败结果
- 玩家存活状态
- 经验 / 金钱变动
- 掉落结果
- 消耗结果
- 受击后最终状态

---

## 11.5 战后摘要

战斗结算成功后，系统必须生成一条不可编辑系统消息，例如：

> `[系统提示：玩家战胜了 slime_01，剩余 HP 120，消耗 药草 x1。]`

该消息属于：

- `role = 'system'`
- `kind = 'battle_summary'`

写入成功后进入 `POST_COMBAT_READY`。

---

## 12. Checkpoint / Event Log / Save Snapshot 冻结

## 12.1 Checkpoint 类型

MVP 固定三类：

- `idle_checkpoint`
- `combat_checkpoint`
- `save_checkpoint`

---

## 12.2 各自职责

### `idle_checkpoint`

- 在从 `IDLE` 发起 AI 请求前创建
- 主要用于请求失败回滚
- MVP 允许以内存为主，可选落库摘要

### `combat_checkpoint`

- 在进入 `COMBAT_PENDING` 前创建
- 必须落库
- 用于战斗取消、刷新恢复、战斗异常回滚

### `save_checkpoint`

- 自动存档或手动存档时创建
- 必须落库
- 用于跨刷新恢复与导入导出

---

## 12.3 Event Log 职责

MVP 中 `event_log` 仅记录 **已成功提交的关键领域事件**。

推荐事件类型至少包含：

- `RequestStarted`
- `AssistantMessageFinalized`
- `ToolCallValidated`
- `VariablesUpdated`
- `BattleTriggered`
- `BattleResolved`
- `CheckpointCreated`
- `RollbackCompleted`

MVP 不要求：

- 全量事件溯源
- 从零重放全部状态
- 所有 UI 行为事件化

---

## 12.4 Save Snapshot 职责

`checkpoint_snapshot` / save snapshot 用于：

- 页面刷新恢复
- 战斗恢复
- 错误回滚
- 存档读写
- 导入导出

它不承担：

- 调试解释语义
- 全部业务事实记录
- 事件溯源替代

---

## 12.5 恢复优先级

MVP 恢复顺序固定为：

1. 优先使用最近 `checkpoint_snapshot`
2. 必要时参考少量 `event_log`
3. 不支持全量事件重放恢复

---

## 13. 数据库表冻结

## 13.1 MVP 必做表

MVP 固定保留以下表：

- `variable_def`
- `variable_value`
- `variable_change_log`
- `item_def`
- `enemy_def`
- `skill_def`
- `world_info`
- `chat_history`
- `event_log`
- `checkpoint_snapshot`
- `save_meta`

---

## 13.2 后置表

以下表不属于 MVP 强制实现：

- `shop_def`
- `asset_ref`
- `chat_preset`
- `world_info_fts`

若后续需要，可在 Sprint 6 之后再补。

---

## 14. UI 冻结

## 14.1 MVP 必做页面

- 标题页
- 新游戏初始化页
- 主游戏页
- 战斗覆盖层
- 设置 / Provider 配置页
- 存档导出入口

---

## 14.2 主游戏页最小构成

- 消息列表
- 输入框
- 状态提示条
- 角色基础状态面板
- 可选简版背包入口
- `POST_COMBAT_READY` 下的“继续剧情”按钮

---

## 14.3 明确后置的 UI

- 左右侧复杂折叠布局
- 资产清单页
- 完整调试抽屉
- 训练场入口
- 商店页
- 移动端战斗专属精细布局

---

## 15. 最小内容包冻结

MVP 必须配一套最小内容包，否则无法验收。

## 15.1 玩家侧

- 1 个初始职业模板
- 1 套初始变量树
- 3~5 个基础技能
- 3~5 个初始物品 / 装备

## 15.2 敌人侧

- 3~5 个敌人模板
- 至少覆盖：
  - 普通命中
  - 弱点
  - 无效 / 反射中的至少一项

## 15.3 世界书侧

- 1 套基础 system prompt
- 5~10 条世界书条目
- 1 条稳定触发战斗的剧情链

## 15.4 验收剧情链

MVP 必须能稳定演示以下流程：

1. 新游戏开始
2. 用户输入剧情动作
3. AI 回复并触发战斗
4. 玩家进入并完成战斗
5. 系统写入战斗摘要
6. 玩家点击“继续剧情”
7. AI 基于战果继续叙事

---

## 16. 失败恢复冻结

## 16.1 MVP 必须处理的失败类型

- AI 请求失败
- 流式中断
- Tool Call 参数非法
- 重复 Tool Call
- `state_hash` 失效
- SQLite 写入失败
- 刷新页面时处于战斗中
- Provider 返回格式异常
- API Key 无效

---

## 16.2 恢复动作

MVP 必须支持以下恢复操作：

- 重试本次请求
- 编辑后重试
- 回滚到最近 checkpoint
- 战斗恢复
- 战斗恢复失败时安全回滚

---

## 17. 验收标准冻结

## 17.1 一致性验收

必须保证：

- assistant 文本不会在变量写入失败时单独 finalized
- battle result 不会在 chat summary 缺失时被视为成功
- 同一 `tool_call_id` 不会重复执行
- request 过期后 tool call 会被拒绝

---

## 17.2 恢复性验收

必须保证：

- AI 请求失败后可重试
- SQLite 写入失败后进入恢复态
- 战斗中刷新可恢复或安全回滚
- 回滚不吞掉玩家允许状态下的主动操作

---

## 17.3 战斗测试验收

至少包含以下测试：

```ts
it('命中弱点时普通图标转为闪烁图标')
it('Miss 扣除两个图标，不足则直接结束回合')
it('反射或吸收时扣除全部剩余图标')
it('Pass 在存在闪烁图标时优先消耗闪烁图标')
it('战斗结束后正确生成 BattleResult')
```

---

## 18. 开发阶段冻结

## Phase 0：设计冻结

输出：

- 本冻结版文档
- 冻结后的字段与状态契约
- 最小内容包清单

## Phase 1：基础骨架

输出：

- 项目壳
- Worker 通信
- SQLite 初始化
- 基础状态机

## Phase 2：聊天与消息生命周期

输出：

- 用户消息
- assistant provisional / finalized / failed_draft
- 请求恢复 UI

## Phase 3：变量系统与提交一致性

输出：

- 根变量树
- Patch 写入
- JSON Schema 校验
- `commitAck`

## Phase 4：Prompt Builder 与工具执行

输出：

- world_info 简检
- 状态序列化
- 工具 Envelope
- 命令映射

## Phase 5：战斗 MVP

输出：

- Press Turn 核心规则
- BattleResult
- 战后摘要

## Phase 6：AI 触发战斗闭环

输出：

- 完整剧情 → 战斗 → 续写闭环

---

## 19. 生效规则

本文档一经确认，即视为 MVP 实现基线。

生效后：

- 原 `game-design-v5.md` 中与本文冲突的内容，以本文为准
- 任何超出本文 MVP 范围的功能，必须转入 Post-MVP 待办，不得在 MVP 实现期间临时混入
- 若要修改本文冻结内容，必须通过一次明确的设计修订，而不是在实现中边做边改
