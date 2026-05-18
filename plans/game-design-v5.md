# 🤖 AI驱动高自由度Web JRPG游戏开发计划书 V4

## 1. 项目概述与设计哲学  

本项目是一款客户端主导、本地持久化、外部 AI 可插拔的 Web JRPG。

- **核心玩法**：以类 SillyTavern 的聊天界面推进无限可能的 AI 生成剧情，在关键节点无缝切入《真·女神转生》式严谨回合制战斗。  
- **核心特色**：AI 负责讲故事，本地引擎负责算数值。通过规范的 Tool Calling 实现 AI 对世界状态的干涉，保证游戏性的平衡与公平。  
- **隐私第一**：本项目采用客户端主导架构，游戏存档、玩家变量、战斗数据、配置数据默认仅持久化在用户本地。  但当用户启用外部 AI Provider 时，系统会根据上下文组装策略，将必要的对话内容、世界书片段与部分游戏状态发送至用户配置的模型服务。系统提供可视化 Prompt 预览、变量注入开关、敏感字段屏蔽机制，以保障用户对数据外发范围的知情权与控制权。  
- **设计原则**：对外部 AI 的一切依赖，均通过精确的契约和本地校验层“套上缰绳”。游戏性由引擎定义，AI 仅作为想象力的燃料。

系统采用“叙事生成与规则执行分离”的架构原则：一切持久状态变更只能由本地 Game Engine 提交。AI Provider 只能产出文本建议与受限工具调用，不能直接决定任何数值结果。

所有 AI 产生的工具调用均视为不可信输入，必须经过 Schema 校验、权限校验、FSM 状态校验和业务规则校验后，才能转换为领域命令执行。  

游戏存档、变量、战斗结果和聊天历史默认持久化在用户本地 OPFS/IndexedDB 中；当用户启用外部 AI Provider 时，系统会按上下文策略发送必要 Prompt 内容，并提供可审计、可配置的数据注入机制。

### 1.x 非目标

当前版本不追求：

- AI 直接管理完整游戏逻辑
- 完整事件溯源式数据库重放
- 多 Provider 全量特性对齐
- 动态可编程规则系统的完全开放式扩展

---

## 2. 系统架构  

采用严格的分层架构（Layered Architecture），层间仅通过明确的接口通信，杜绝循环依赖。

1. **表现层 (UI / View Layer)**  
   - 职责：Vue 3 组件渲染聊天流、战斗界面、系统菜单；捕获并下发用户动作。  
   - 对外依赖：仅调用下层提供的 Hook / Store Actions。
2. **游戏引擎层 (Game Engine)**  
   - 职责：维护运行时游戏状态（HP/MP、背包、位置）；实现 JRPG 战斗规则、伤害公式、回合裁定。  
   - 技术：Pinia Store + 纯 TypeScript 类，完全脱离 DOM 和 API 调用，可独立进行单元测试。
3. **LLM 编排层 (AI Orchestrator)**  
   - 职责：按对话补全预设（如有）顺序组装 Prompt（注入世界书、游戏 State）；分发请求至具体 AI 提供商；处理流式输出与工具调用拦截。
   - 技术：Vercel AI SDK + Zod Schema 校验 + `js-tiktoken`。
4. **数据持久层 (Data Access)**  
   - 职责：存储聊天记录、世界观设定、敌人图鉴等结构化数据；管理存档的导入/导出。  
   - 技术：SQLite Wasm (OPFS) + 内存缓存。
   - **数据持久层必须运行在一个独立的 Web Worker 中**。

### 2.x 核心运行时子系统

运行时组件如下：

```text
Session Manager：管理游戏会话外层状态
AI Orchestrator：管理 Prompt 构建、请求、流式输出、工具调用收集
Command Bus / Engine Facade：统一接收命令并执行业务校验
Checkpoint Manager：管理检查点创建与恢复
Persistence Gateway：与 Worker 通信，负责持久化提交确认
```

各层不得跨层直接写状态；任何持久状态变更均通过 Command → Engine → Repository/Worker 提交。

---

## 3. 核心数据流  

```text
[用户操作] 
    │
    ▼
[表现层] ──(发送 Action)──> [游戏引擎 (Pinia)]
                                │
                                ├─(读取当前 State/世界书)
                                ▼
[LLM 编排层]
    │ 1. 组装消息列表 + 注入可用工具
    │ 2. 通过 AI SDK 实例发起流式请求
    ▼
[AI 提供商] (OpenAI / Claude / DeepSeek ...)
    │
    ▼ (返回 Text + Tool Calls)
[编排层]
    │ 1. 流式文本直推 UI 渲染
    │ 2. 流结束后验证 Tool Calls (Zod)
    │ 3. 执行合法工具调用，更新游戏状态
    ▼
[Pinia] <──> [SQLite (OPFS)] (自动存档点)
```

### 3.1 叙事流视角

```text
[用户输入]
    │
    ▼
[Prompt 组装]
    │
    ▼
[AI 返回流式文本]
    │
    ▼
[provisional message buffer]
    │
    ▼
[最终提交聊天消息]
```

### 3.2 命令流视角

```text
[Tool Call]
    │
    ▼
[Envelope 校验]
    │
    ▼
[转 DomainCommand]
    │
    ▼
[Engine 校验]
    │
    ▼
[Worker 提交]
    │
    ▼
[commitAck 后正式化]
```

---

## 4. 状态机与用户交互锁  

### 4.1 状态定义

全局有限状态机（FSM）确保高并发交互下数据的一致性。

#### 4.1.1 外层状态： 用户感知状态（SessionState）

`SessionState`由 Session Manager 持有

| 状态                | 说明                                                               | 允许的用户操作                                | 触发下一状态的事件                                                                                 |
| ------------------- | ------------------------------------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `IDLE`              | 等待玩家输入                                                       | 发送文字、使用物品、打开商店/背包、战斗模拟器 | 用户发送消息 → `GENERATING`                                                                        |
| `GENERATING`        | AI 正在生成回复                                                    | 读操作、终止生成（写数据相关 UI 锁定）        | 流结束且无战斗触发/主动中断 → `IDLE`；触发战斗工具调用 → `COMBAT_PENDING`；出错 → `ERROR_RECOVERY` |
| `COMBAT_PENDING`    | 战斗待启动，可备战                                                 | 查看敌人信息、更换装备、使用消耗品            | 玩家确认进入战斗 → `IN_COMBAT`；取消战斗（回滚剧情）→ `IDLE`（需重试）                             |
| `IN_COMBAT`         | 回合制进行中                                                       | 战斗操作（攻击、技能、物品、逃跑）            | 战斗结束 → `POST_COMBAT_READY`；战斗界面异常关闭 → `COMBAT_PENDING`                                |
| `POST_COMBAT_READY` | 战斗结果已提交、系统战斗摘要已写入，等待玩家决定是否继续剧情生成。 | 查看战果、整理背包/装备、 点击“继续剧情”      | 玩家点击“继续剧情” → `GENERATING`；玩家暂不继续 → 保持 `POST_COMBAT_READY`； 存档/退出 → 正常允许  |
| `ERROR_RECOVERY`    | 生成过程出错（网络/格式/配额）                                     | 重试 / 回滚到上个检查点 / 编辑输入            | 重试成功 → 恢复之前状态；放弃/回滚 → `IDLE`                                                        |

#### 4.1.2 内层任务状态：系统执行阶段（PipelineState）

`PipelineState` 由 AI Orchestrator 持有

| 状态                    | 说明                         |
| ----------------------- | ---------------------------- |
| `PROMPT_BUILDING`       | 正在构建Prompt，准备发送给AI |
| `STREAMING_TEXT`        | AI正在流式输出文本           |
| `WAITING_TOOL_CALLS`    | 等待工具调用                 |
| `VALIDATING_TOOLS`      | 验证工具调用                 |
| `EXECUTING_COMMANDS`    | 系统执行命令中               |
| `PERSISTING_CHECKPOINT` | 保持当前检查点               |
| `ROLLING_BACK`          | 回滚到上一个检查点           |

内层状态仅在 `GENERATING` 或 `ERROR_RECOVERY` 等外层状态下激活，其切换逻辑如下：

- 进入 `GENERATING` 外层状态后，系统立即进入 `PROMPT_BUILDING`，完成上下文组装后推送至 AI Provider，并转入 `STREAMING_TEXT`。
- `STREAMING_TEXT` 结束时，若有待处理的工具调用，转入 `WAITING_TOOL_CALLS`；否则直接进入 `PERSISTING_CHECKPOINT`。
- `WAITING_TOOL_CALLS` 收集全部模型输出的工具调用后，转为 `VALIDATING_TOOLS`。
- `VALIDATING_TOOLS` 逐个校验（Schema + 业务规则）。合法调用转为 `EXECUTING_COMMANDS`，全部执行完毕后进入 `PERSISTING_CHECKPOINT`；若存在非法调用或执行失败，则转入 `ROLLING_BACK` 或 `ERROR_RECOVERY`。
- `PERSISTING_CHECKPOINT` 完成后，临时消息正式化，外层状态返回 `IDLE`。
- `ROLLING_BACK` 将游戏引擎状态恢复到最近的检查点，并丢弃全部临时变更，随后外层状态进入 `ERROR_RECOVERY`。
- 在任何内层阶段若捕获到 Provider 超时、网络错误或配额耗尽，立刻中断当前流程，外层状态转为 `ERROR_RECOVERY`，内层状态机重置。

内层状态的转换必须记录在不可变日志 ( `GameEvent` ) 中，便于调试和回滚审计。

- AI 流式文本在 `GENERATING` 阶段先进入临时消息缓冲区，标记为 `provisional=true`。  
- 只有当工具调用全部校验通过、状态变更提交成功后，临时消息才转为正式消息。  
- 若工具调用失败，临时消息可保留为“失败草稿”，允许用户重试、编辑或丢弃。

内层状态只在一次 AI 请求生命周期内有效，请求结束、取消或失败后必须重置为空。

`COMBAT_PENDING` 阶段分为剧情提交前和剧情提交后两种模式：

- 默认模式下，AI 触发战斗后的叙事消息仍处于 provisional 状态，玩家取消战斗时同时丢弃该消息和对应工具调用。  
- 若玩家在备战阶段进行了装备调整或消耗品使用，这些操作属于玩家主动操作，不随剧情取消自动回滚，除非用户选择“回到战斗触发前检查点”。

#### 4.1.3 UI 模态状态（ModalState）

`ModalState` 由 UI Store 持有，用于定义页面覆盖层

| 状态             | 说明         |
| ---------------- | ------------ |
| `NONE`           | 无覆盖       |
| `PARTY`          | 编队         |
| `INVENTORY`      | 背包         |
| `SHOP`           | 商店         |
| `SETTINGS`       | 设置         |
| `SAVE_MENU`      | 保存菜单     |
| `BATTLE_OVERLAY` | 战斗界面模态 |

#### 4.1.4 状态转移约束

- 非 `IDLE` / `POST_COMBAT_READY` 状态下不能打开非只读业务模态
- `GENERATING` 状态禁止发起第二个 AI 请求
- 同一时刻只允许一个 active request
- `IN_COMBAT` 状态下所有 AI 编排任务必须暂停或不可进入

### 4.2 检查点定义

| 检查点类型          | 触发时机                     | 用途                    |
| ------------------- | ---------------------------- | ----------------------- |
| `idle_checkpoint`   | 每次从 `IDLE` 发起 AI 请求前 | AI 生成失败回滚         |
| `combat_checkpoint` | 进入 `COMBAT_PENDING` 前     | 战斗取消 / 战斗异常恢复 |
| `save_checkpoint`   | 自动存档 / 手动存档          | 存档读写与灾难恢复      |

任何关键状态进入前必须写入一个**检查点（Checkpoint）**，以便回滚。所有非战斗模态（背包、商店）在 `IDLE` 状态下可自由开启，在其它状态下必须禁用入口。

### 4.2.1 检查点职责边界

- Checkpoint：运行时快速回滚
- GameEvent Log：调试审计与开发者重放
- Save Snapshot / SQLite：跨刷新恢复与导入导出
  
### 4.2.2 检查点回滚优先级

1. 优先恢复最近检查点
2. 必要时补应用少量后续事件
3. 跨刷新时从最近持久快照恢复

---

## 5. 战斗系统详细契约  

### 5.1 核心机制：Press Turn Battle

战斗采用《真·女神转生 V》的 Press Turn 规则，包含以下关键特性：

- **行动图标（Turn Icons）**：双方回合开始时获得数量等于场上存活成员数的行动图标。每执行一个行动消耗一个或半个图标，图标耗尽回合结束。
- **弱点与暴击**：攻击命中弱点或触发暴击时，当前行动图标变为**闪烁图标（Flashing Icon）**，不消耗行动次数。
- **Pass 行动**：将行动让给下一位成员（循环队列）。若当前有闪烁图标，Pass 将**优先消耗闪烁图标**，否则使一个普通图标变成闪烁图标。
- **MISS/无效/吸收/反射**：攻击被无效时，扣除 2 个行动图标；攻击吸收或反射时，扣除**全部**剩余行动图标；落空（Miss）扣除 2 个图标。若图标数不足以扣除，回合直接结束。
- **回合结束条件**：无剩余图标或所有成员无法行动（例如全部处于异常状态）。

所有 Press Turn 图标变化均须进入标准化战斗事件日志，以支持回放、测试断言和调试显示。

### 5.2 高可扩展性设计（参照 DDS 系列）

引擎设计为规则可编程，以支持类似《数码恶魔传说》的扩展，包括但不限于：

- **组合技（Combo Skills）**：当多个成员携带特定技能时，可以使用额外组合技。组合技由数据配置（技能ID序列 + 结果技能ID），引擎运行时检测。

- **装备被动规则修改**：装备（或被动能力）可携带 **Rule Modifier**，动态改变个体战斗规则。例如：
  - `pass_ring`：使 Pass 行动不消耗图标（闪烁或普通均不消耗）。
  - `synchro_ring`：组合技所需消耗的图标数 -1（最低为 1）。
  - `avoid_ring`：闪避和无效化也消耗对方所有的图标。
  - `glimmer_mod`：命中弱点时额外产生一个闪烁图标。
这些扩展均通过在战斗初始化时加载的 **Modifier 注册表** 实现，每个 Modifier 是纯函数，接收当前战斗上下文并返回修改后的规则参数。开发者可通过 JSON 配置添加新的装备、被动技能和 Modifier，无需改动核心战斗循环。

Modifer 元模型：
`scope`: actor / side / battle
`hook`: before_cost / before_hit / after_damage / after_press_turn_settle …
`priority`
`stackMode`: stack / override / max / min
多个 Modifier 同时命中同一 Hook 时，按 priority 排序执行；冲突按 stackMode 解决。

### 5.3 战斗流程与状态隔离

- 战斗模块作为独立 Pinia Store（`useBattleStore`）运行，仅在 `IN_COMBAT` 状态下激活。
- 战斗开始前，引擎从 SQLite 加载敌人数据，从玩家状态复制当前作战成员属性快照，战斗过程中的一切变化仅写入该战斗 Store，**绝不直接污染全局游戏状态**。
- 战斗结束后，将最终结果（胜败、存活状态、经验/金钱/掉落）通过标准化 `BattleResult` 对象提交给全局引擎，由其原子性更新持久状态。
- **不允许再次触发相同的战斗**（过往战斗入口一旦结束就永久关闭，**训练场等剧情外战斗除外**）

战斗模式字段：`battle_mode`: 'story' | 'training' | 'challenge' | 'simulation'

- `story`：会写回正式状态、关闭 encounter、生成战斗摘要
- `training`：不影响正式存档
- `challenge`：除开可能获取的战利品奖励和点亮图鉴外，几乎不影响正式存档
- `simulation`：仅开发调试，不进入正式历史

### 5.4 战斗判定顺序

1. 行动合法性检查
2. 消耗资源检查：MP / HP / 道具 / 图标
3. 反射 / 吸收 / 无效判定
4. 命中判定（命中放在后面的原因是，如果携带`反射 / 吸收`的防御者先判定了Miss，收益是会降低的）
5. 弱点 / 耐性判定
6. 暴击判定
7. 伤害计算
8. 状态附加
9. Press Turn 图标结算
10. 被动 / Modifier 后处理
11. 死亡 / 胜负判定
12. 日志生成 （`verbose` / `summary`）

### 5.5 AI 触发规范  

AI 通过 Tool Calling 触发战斗，**只能传递本地已注册的敌人 ID 与修饰符**，绝不允许给定任何数值。  

- 工具名称：`trigger_battle`  
- 参数（Zod 校验）：  

```ts
{
  encounter_id: string,
  enemy_group_id?: string,
  enemies: Array<{
    enemy_id: string,
    count: number
  }>,
  level_policy?: {
    type: 'fixed' | 'player_scaled' | 'range',
    min?: number,
    max?: number
  },
  modifiers?: string[],
  narrative_reason: string
}
```

其中：

- `encounter_id` 用于防重复，必须幂等，同一`encounter_id`在 story 模式下只允许成功触发一次；
- `enemy_group_id` 支持预设敌群；
- `narrative_reason` 便于调试和日志审计；
- `level_policy` 比 `min_level/max_level` 更清晰。
System Prompt 中将动态注入当前场景可用的敌人列表及合法 modifiers，确保 AI 知晓边界。

### 5.6 本地执行  

- 引擎从 SQLite 中读取 `enemy_id` 的固定模板（属性、技能、弱点等）。  
- `enemy_count`、`min_level/max_level` 通过引擎公式生成敌人实例（等级影响属性缩放）。  
- `modifiers` 按预定义规则修改：例如 “ambush” 使敌方第一回合抢先，“elite” HP×1.5且掉落提升。  
- 战斗流程在完全隔离的 Pinia 战斗模块中运行，不能访问剧情上下文。
- 战斗流程可视为一个事务，如果战斗被外部强制中断，将直接返回战斗之前的状态。

**执行校验**：

- 当前 SessionState 必须允许进入 COMBAT_PENDING
- 当前 request_id + context_version + state_hash 必须匹配
- 相同 toolCallId 不得重复执行

### 5.7 结算与返回  

战斗结束后，引擎生成标准化结果对象（`BattleResult`），并拼装一句不可编辑的系统文本：  
> `[系统提示：玩家战胜了 slime_01，剩余 HP 120，消耗 药草 x1。]`  
Game Engine 原子提交正式状态，将该文本作为不可编辑的**系统角色消息**隐式追加到对话流末尾。
之后进入 `POST_COMBAT_READY` 状态，玩家点击“继续剧情”后，再发起下一次 AI 请求。
下一次请求时 AI 将基于此继续叙事。AI 绝无可能修改实际数值。
系统默认采用半自动续写模式：战斗结算完成后不自动请求模型，而是等待玩家主动继续剧情。未来可配置为自动续写模式。

### 5.8 测试标准

每条规则都应有测试用例，例如：

```ts
it('命中弱点时普通图标转为闪烁图标')
it('Miss 扣除两个图标，不足则直接结束回合')
it('反射时扣除全部剩余图标')
it('Pass 在存在闪烁图标时优先消耗闪烁图标')
it('2号位装备的 pass_ring 使 2号位 Pass 不消耗任何图标')
```

---

## 6. AI 编排层与多 Provider 适配  

### 6.1 Vercel AI SDK

- 使用 `@ai-sdk/openai-compatible`、`@ai-sdk/anthropic`、`@ai-sdk/google` 等 Provider 包。
- 编排层通过 `generateText` / `streamText` 函数与模型交互，不再自行实现流解析和工具调用分发。

### 6.2 流式处理与工具调用  

系统支持流式与非流式两种 AI 输出模式。  
两种模式共享同一套 Prompt 构建、工具调用校验、领域命令执行和持久化流程，仅在 UI 展示策略上不同。  
在流式模式下，AI 输出首先写入 provisional message buffer，并实时显示；待工具调用与状态变更全部提交成功后，消息转为正式历史。  
在非流式模式下，AI 响应完整返回并通过校验后，才一次性写入正式对话历史。  
若用户希望保留沉浸式逐字体验，可启用“完整生成后本地打字机播放”模式，该模式不影响底层一致性。
SDK 原生支持 **流式响应** 与 **Tool Calling** 的全自动管理：

- AI SDK 负责 Provider 适配、流式响应与标准工具调用解析；
- 编排层需提供工具定义（Zod Schema）及对应的**本地执行函数**。AI SDK 负责统一 Provider 调用、流式输出和工具调用接口适配；编排层仍需实现独立的工具调用审计、Envelope 校验、幂等保护、错误归一化与状态绑定校验、重试策略和降级流程。
- 流式文本通过 `onChunk` 回调直接推送到 UI，无额外解析负载。
- LLM Orchestrator 不得直接修改 Pinia Store 或 SQLite。  
- 所有 AI Tool Call 必须转换为 `DomainCommand`，交由 Game Engine 的命令处理器执行。  

```ts
type DomainCommand =
  | { type: 'TriggerBattle'; payload: TriggerBattlePayload }
  | { type: 'UpdateVariables'; payload: VariablePatchPayload }
  | { type: 'SetBgm'; payload: SetBgmPayload }
  | { type: 'AppendSystemLog'; payload: SystemLogPayload }
```

- Game Engine 负责校验、事务、事件发布和状态提交。  
- Data Access 只接受来自 Game Engine / Repository 层的持久化请求。

**Tool Execution Envelope**：
执行协议包括字段：

- `request_id`
- `context_version`
- `state_hash`
- `tool_call_id`
- `tool_name`
- `args`
- `issued_at`

工具执行链顺序：

1. Schema 校验
2. Tool 白名单/权限校验
3. FSM 校验
4. 上下文绑定校验
5. 幂等校验
6. 转 DomainCommand
7. Engine 执行
8. commitAck 后正式化

### 6.3 重试与回滚  

- 生成过程中发生网络错误或 JSON 校验失败时，提供“重试”按钮，用户可选择：  
  - 使用原参数重试；  
  - 编辑最后一次输入后重试；  
  - 回滚到上次 IDLE 检查点（丢弃生成期间的一切临时变更）。
- 请求区分：
  - **请求级重试**：同一输入重新请求模型
  - **执行级重试**：仅重试未成功持久化的本地提交

### 6.4 多 API 工作流与变量更新分离

实践表明，将“变量更新”从主叙事 API 中剥离，交给更轻量、更稳定的辅助 API 处理，可显著提高数值准确性并降低主模型输出格式错误的概率。系统应支持以下两种工作模式：

- **单 API 模式（向下兼容）**  
    主 API 同时负责正文生成、战斗触发及所有 Tool Call（包括变量更新）。编排层在流结束后统一解析并执行。默认工作于此模式。

- **双 API 模式（推荐）**

  - **主 API**：剧情生成 + `trigger_battle` 调用。
  - **副 API**：专门处理变量提取与更新。接收的内容为：`[系统指令：提取变量变化，规则：...] + [最近一轮对话] + [当前游戏状态摘要]`。输出为经过 Zod 校验的 `state_update` 工具调用 JSON。
  - 副 API 可使用更便宜/更快的模型，并配置独立的 `temperature`、提示词与 Token 上限，以保证稳定性。
  - 编排层负责：流式正文结束 → 若配置了副 API，则异步调用副 API 获取变量更新 → 校验并执行 → 转入下一状态；若副 API 调用失败，可回退至主 API 的 Tool Call（如果存在）或进入 `ERROR_RECOVERY`。

该设计将想象型任务（叙事）与逻辑型任务（数值）分离，既符合单一职责原则，又能大幅降低 API 费用。

### 6.5 变量可见性与可编辑性约定

为保证游戏状态的严谨性与可控性，所有游戏变量需按以下泛用规则进行分类，并以此约束 AI 的读写权限及 Prompt 注入方式。

#### 6.5.1 变量分类（按 AI 交互权限）**

1. **可读可写变量（AI 可获取其值，且能通过工具主动修改）**

    - 典型示例：剧情标记（“已击败幽灵”、“营火点燃”）、好感度分数、玩家当前装备、背包内可消耗物品数量、当前地图场景、任务阶段。
    - 注入 Prompt 时，以结构化清单形式呈现（如“当前状态摘要”）。
    - AI 通过 `update_variables` 工具修改，明确提供键名和新值。引擎需经过 Zod Schema 校验，确保数值在合法区间（如好感度 0~100），物品增减逻辑也由引擎原子化执行，杜绝非法状态。
    - AI 可写不代表 AI 可任意 Patch 全部业务关键字段。
    - 高风险字段：金钱、装备槽、物品数量等

2. **只读可见变量（AI 可获取其值，但不可直接修改）**

    - 典型示例：玩家当前 HP/MP、等级、基础属性（力量/智力）、敌人图鉴收集度。
    - 注入 Prompt 时一并提供，但 System Prompt 中明示“以下数据仅供叙事参考，你无法直接修改。若剧情需要导致其变化（如受伤），请调用相关战斗或事件工具，由系统引擎统一处理。”
    - 所有此类变量的实际变更必须通过战斗结算、商店交易、特定事件工具等预定义的本地引擎逻辑进行，绝不允许 AI 直接赋值。

3. **完全隐藏变量（对 AI 不可见、不可修改）**

    - 典型示例：加密的 API Key 配置、调试开关、存档元数据、玩家真实设备信息。
    - 永远不注入 Prompt，Tool 定义中也绝不暴露。

#### 6.5.2 注入 AI 上下文的具体格式

编排层在每轮对话组装消息时，将变量的当前值序列化为一个不可编辑的系统消息块（放置在对话历史末尾），格式为YAML。

同时，在 System Prompt 底部追加约束：“你只能通过提供的 `update_variables` 工具修改标记为可写的变量。任何尝试修改只读变量的工具调用都将被系统拦截并导致警告。”

除去 System Prompt 之外，世界书条目的 `content` 也需要在发送前注入好需要注入变量的地方。示例PromptBuilder Pipeline如下：

```text
1. Load Raw Entries
   从 SQLite 读取 world_info、chat_preset、变量定义、用户开局数据

2. Deserialize
   将 JSON / YAML / 数据库字段反序列化为结构化对象

3. Validate
   校验条目结构、字段类型、启用状态、访问权限

4. Select
   根据关键词、当前场景、优先级、Token 预算选择条目

5. Build VariableContext
   从变量系统读取可注入变量，形成只读上下文对象

6. Render Templates
   对允许模板化的字段执行变量替换

7. Sanitize / Escape
   对渲染结果做必要转义，防止破坏 Prompt 分隔结构

8. Assemble Prompt
   按对话补全预设顺序组装 System / World Info / History / State

9. Freeze Request
   生成 request_id、context_version、state_hash

10. Send
   发送给 AI Provider
```

注入模板使用宏适配风格，如：

```text
<user_profile>
# '{{}}' 和 '<>' 等价，但不是和上面的 XML 标签等价，仅包含 user、char 等特定关键字。
姓名: {{format_message_variable::stat_data.player.name}} # 来自变量（假设存在有效prefault），若只有stat_data则表示整颗变量树
姓名: {{user}} # 默认等同于{{format_message_variable::stat_data.player.name}}
职业: {{format_message_variable::stat_data.player.class|default=自由人}} # 来自变量，带默认值管道
</user_profile>
```

- 模板变量不会在存储阶段或反序列化阶段被替换，数据库始终保留原始模板。
- 渲染结果只参与本次 Prompt 组装，不回写世界书原文。
- 变量缺失时，根据运行模式采用报错、保留原文、空字符串或占位符策略。

#### 6.5.3 工具执行时的引擎校验

无论主 API 还是副 API 发起变量更新，`update_variables` 工具需在游戏引擎层经过以下校验链：

1. Zod Schema 校验：类型、格式、取值范围。

2. 业务规则校验：如无法删除玩家最后一件武器、金钱不能为负。

3. 若校验失败，工具调用被拒绝，引擎返回错误描述给编排层，触发 `ERROR_RECOVERY` 状态（或静默忽略，视配置而定）。

---

## 7. 上下文管理与压缩策略  

### 7.1 Token 预算分配表（示例，可配置）  

| 组成部分                       | 最大 Token 占比    | 说明                        |
| ------------------------------ | ------------------ | --------------------------- |
| System Prompt（角色定义+规则） | 固定 ~1500         | 压缩时不可减少              |
| 注入的世界书条目               | 4000 ~ 16000       | 常驻/关键词匹配，优先级排序 |
| 最近对话（首尾保护）           | 保留最近 6~10 轮   | 原始文本不被压缩            |
| 中间历史摘要                   | 填充剩余空间的 70% | 由异步大总结生成            |
| 当前游戏状态变量               | ~200               | 注入必要数值                |
| 预留响应缓冲区                 | 20%                | 确保 AI 回复空间            |

对于 Claude Opus 4.6 或 DeepSeek V4 Pro 这类有效上下文极大（1M）的模型，“最近对话”可以扩充到全流程对话，不做裁剪，有利于 cache hit。
System Prompt 与世界书条目的具体安排顺序由 **对话补全预设** 决定（以及 `temperature` 等参数）。

### 7.2 版本化异步总结  

- 每次用户输入时，上下文对话流获得一个递增的 `contextVersion`。  
- 当 Token 使用率超过 80% 时，触发后台异步总结任务，总结当前范围的中间对话。  
- 系统不硬编码模型名称对应的上下文策略，而是维护 `ModelProfile` 配置： `contextWindow`、`recommendedInputBudget`、`supportsToolCalling`、`supportsStreaming`、`costPer1kInput`、`costPer1kOutput`、`providerLimit`。  默认配置可随版本更新，用户也可手动覆盖。例如：

```ts
interface ModelProfile {
  provider: string
  model: string
  contextWindow: number
  maxOutputTokens: number
  supportsToolCalling: boolean
  supportsStreaming: boolean
  recommendedPromptBudgetRatio: number
}
```

- 总结结果标记为 `producedAtVersion: N`。编排层组装下次 Prompt 时，只接收 `producedAtVersion <= currentVersion` 的总结，防止剧情撕裂。  
- 总结内容以系统消息形式插入，UI 显示可折叠的“历史摘要”卡片。

### 7.3 手动控制  

- 玩家可手动隐藏特定楼层对 AI 不可见。  
- 可手动触发“全量大总结”，将可见历史压缩为一个条目并存入世界书特殊条目。

### 7.4 Prompt 可观测性

调试重点记录：

- `request_id`
- `context_version`
- 命中的世界书条目
- 最终 token 估算
- cache hit
- tool 列表快照

---

## 8. 用户界面设计  

游戏界面遵循**沉浸感优先、信息清晰**的设计原则，由四个主要屏幕组成，通过页面路由平滑过渡。

### 8.1 开始屏幕 (StartScreen)  

- **用途**：应用启动后的第一个画面，降低进入门槛。  
- **布局**：全屏显示，极简设计，背景为动态粒子/渐变动画或静态艺术图。  
- **交互**：  
  - 屏幕中央显示提示文字：“按下 Enter 或点击任意位置开始”。  
  - 支持键盘 `Enter` 键触发，同时鼠标/触摸点击任意区域亦可。  
  - 触发后立即调用浏览器全屏 API（`Element.requestFullscreen()`），失败时静默忽略。  
- **动画**：画面从黑屏淡入，点击后淡出并过渡到标题页面。

### 8.2 标题页面 (SplashScreen)  

- **用途**：游戏品牌展示与主菜单选择。  
- **布局**：  
  - **背景**：可配置的静态图、视频或 WebGL 特效。  
  - **中央内容**：  
    - 游戏主标题（大字，可带副标题）。  
    - 功能按钮组（垂直排列）：  
      - **开始新游戏**  
      - **继续游戏**（检测到存档时亮显，否则灰色不可点击）  
      - **设置**（可选，快速调整音量、语言等）  
      - **退出**（尝试关闭标签页，或返回开始屏幕）  
  - **底部**：全屏切换按钮、版权信息、作者链接、版本号等页脚元素。  
- **动画**：从开始屏幕淡入；点击按钮可带有按压效果，页面切换淡出。

### 8.3 开局设置页面 (NewGameSetup)  

- **用途**：新游戏开始前的配置，决定初始状态。  
- **触发**：标题页面点击“开始新游戏”后进入。  
- **布局**：  
  - 表单式设计，集中居中，可滚动的卡片容器。  
  - **内容**：  
    - 预设模板选择（如“标准冒险者”、“魔法学徒”、“佣兵”等，会预填部分选项）。  
    - 角色姓名输入框。  
    - 初始属性点分配（可滑动或步进器）。  
    - 初始携带品/装备选择（多选或勾选）。  
    - AI 模型选择与参数（Provider、模型名称、Temperature 等，若已全局配置则为可选覆盖）。  
    - 世界设定/模组选择（如加载预设的世界书）。  
  - **按钮**：  
    - **确认**：校验输入 → 初始化 Pinia 状态 → 写入数据库 → 跳转到正式游戏页面。  
    - **取消**：返回标题页面。  
- **体验**：表单可保存为“预设方案”以便复用；所有选项默认安全，可用提示信息说明影响。

### 8.4 正式游戏页面 (Dashboard/GameView)  

这是游戏的主舞台，在 `IDLE` 及所有状态下持续显示，但模态层覆盖时会变暗。

#### 8.4.1 主视窗布局  

- **左侧面板**：可折叠的侧边栏，展示当前场景（提取自变量）的缩略图、世界信息、迷你BGM播放器。
- **中央对话区**：占据主要空间，消息列表支持 Markdown 渲染和引文染色。系统消息（如战斗摘要）以特殊样式展示。每条玩家/系统消息右下角提供“隐藏”按钮。  
- **右侧面板**：可折叠的侧边栏，显示角色实时数值（HP/MP/其他）、状态、持有的物品。  
- **顶部栏**：包含快捷操作图标（背包、商店、训练场）、游戏系统菜单（存档/读档/设置）、全屏切换。标题或剧情名称可居中显示。
- **系统状态提示条**：文字提示当前非 `IDLE` 状态，如：
  - 正在生成
  - 工具调用校验中
  - 战斗待确认
  - 战斗已结束，等待继续剧情
  - 存档失败警告

#### 8.4.2 输入区域  

- 位于中央对话区底部，固定在视窗下方。  
- 包含文本输入框（多行自适应高度/滚动条）、发送按钮、快捷操作图标（道具快捷使用、能力等）。  
- 在非 `IDLE` 状态下，输入框禁用并显示状态说明（如“AI 正在叙述...”、“先继续剧情或处理战后整理”）。

#### 8.4.3 模态覆盖层  

- **战斗界面**：全屏模态，背景变暗，中央战斗区域，包含敌我双方状态、指令菜单。完成以前无法关闭。  
- **商店/背包/仪表盘**：以侧拉抽屉或居中模态形式呈现，仅在 `IDLE` 时可打开。关闭时动画平滑。
- **资产清单**：引用的 **CC-BY(-NC)-SA** 资产列表，包括字体、图标、音乐等。
- **设置/存档管理**：标准模态，提供选项卡式配置，仅在 `IDLE` 或 `POST_COMBAT_READY` 时可打开。

#### 8.4.4 调试模式抽屉  

- 通过全局开关（开发者密码或隐藏组合键）从底部拉出。  
- 提供：Token 实时线图、Raw Prompt 查看器、Pinia 状态编辑器、工具调用日志列表、战斗模拟器入口。  
- 除“进入战斗模拟器”外，其它均为只读或需要手动确认修改。

**移动端 (宽度 < 768px)特殊处理**：全屏对话流。仪表盘、背包等统一收纳为底部导航栏的图标，点击后以**底部抽屉 (Bottom Sheet)** 弹出。战斗界面在手机上可能需要特殊的卡片式紧凑布局。侧边面板自动隐藏，通过汉堡菜单唤起。

---

## 9. 数据持久化与存档设计  

### 9.1 运行时存储  

- **Wasm SQLite + OPFS** 为主数据库，保存：聊天记录、世界书、敌人图鉴、玩家数据等。  
- OPFS 内部维护多个文件（`slot_1.db`, `slot_2.db`, `auto_save.db`）。【标题页面】读取所有 DB 的 `save_meta` 表以生成存档列表。点击读取时，将目标 DB 挂载为当前活跃数据库。
- **IndexedDB** 仅用于存储用户配置（如 API Key，加密存储）和 UI 偏好。

### 9.2 Web Worker与Pinia的状态同步方案

- 主线程**不得直接访问** SQLite。所有数据库操作通过 `DbWorkerClient` 暴露的异步接口完成。  
- Game Engine 提交状态变更时，先生成不可变 `GameEvent`，更新内存状态，再异步持久化事件与快照。  
- 对于战斗结算、存档导入、存档覆盖等关键写操作，必须等待 Worker 返回 `commitAck` 后才允许状态机进入下一阶段。

### 9.3 自动存档  

聊天正式提交后可触发自动存档，战斗结算后必须等待关键提交 ACK。

**关键提交**：

- 聊天消息正式化
- 变量写入
- 战斗结算
- save_meta 更新
- encounter 状态关闭

这些必须等 Worker `commitAck` 后才算成功
自动存档将当前 Pinia 状态同步写入 SQLite，并记录版本号。
非关键 UI 状态不进入核心存档。
OPFS 在现代浏览器中通常能提供较好的本地文件读写性能，但所有数据库操作仍应放入 Web Worker，并通过批量写入、事务和 UI 异步反馈避免主线程卡顿。

### 9.4 存档导入导出  

- **完整存档 (.sav)**：  
  将整个 SQLite 数据库 `slot_x.db` 与一个 `meta.json`（存档时间、角色名、剧情摘要等）打包为 `.zip` 并重命名为 `.sav`，提供浏览器下载。导入时解包、覆盖 OPFS 数据库，刷新页面即可载入。  
- **ST 兼容对话导出**：  
  仅导出聊天历史为 SillyTavern V2 的 JSONL 格式（无游戏状态），供其他前端使用。  
- **校验**：导入时必须先进行 Schema 校验（Zod 验证 DB 表结构健全），防止文件损坏引发崩溃。

### 9.5 Schema Versioning / Migration

Schema 需包含：

- `schema_version`
- `app_version`

导入存档时进行版本检查，可迁移则执行 migration，不可迁移则阻止导入并提示。

### 9.6 灾难恢复提醒  

游戏界面定时提醒用户导出完整存档。

---

## 10. 变量系统设计

游戏中的所有数值、标记、状态统一纳入变量系统管理。系统需兼顾高性能查询、严格校验、AI 友好注入以及人类可读性，基于 SQLite 实现，同时融合 MVU Zod 的约束与 JSON Patch 更新模式。

### 10.1 变量分类与存储模型

所有变量统一以 JSON 值存储；数据库层不区分 scalar/tree，不设置独立值表。
类型约束、访问级别、默认值与校验规则均由变量定义元数据提供。

#### 核心表设计

```sql
-- 变量定义表（元数据）
CREATE TABLE variable_def (
  id TEXT PRIMARY KEY,          -- 如 "player.hp"
  category TEXT NOT NULL,       -- 分组：player, world, npc
  type TEXT,                    -- 'integer', 'float', 'boolean', 'string' 等
  schema TEXT,                  -- JSON Schema字符串
  access_level TEXT NOT NULL DEFAULT 'read_write' 
                                -- 'read_write', 'read_only', 'hidden'
  default_value TEXT,           -- JSON 序列化的默认值
  description TEXT,
  updated_at TEXT NOT NULL
);
-- 变量当前值
CREATE TABLE variable_value (
  var_id TEXT PRIMARY KEY REFERENCES variable_def(id),
  value TEXT NOT NULL,           -- 实际值以文本存储，读取时按 scalar_type 解析
  updated_at TEXT NOT NULL 
);
```

### 10.2 约束与校验

每个变量在 `variable_def.schema` 中存储其JSON Schema（**不是Zod Schema**）。引擎在应用启动时通过统一的 Schema Adapter 将 JSON Schema 转换为运行时校验器；工具参数仍可使用 Zod 定义。
JSON Schema 负责值结构合法性；业务规则仍由 Game Engine 执行，不下沉到数据库层。

任何变量写入（无论是 AI 工具调用还是本地引擎）都必须通过校验。校验失败将触发 `ERROR_RECOVERY`，拒绝变更并记录详情。

### 10.3 更新机制

- **变量更新**：内部统一更新机制采用 **JSON Patch（RFC 6902）**，由本地应用：
    1. 读取当前 `value_json`（注入或主动工具）。
    2. 应用 Patch（使用 `fast-json-patch` 等库）。
    3. Zod 校验新树。
    4. 校验通过后事务写入。
- **事务保护**：涉及多变量修改（如战斗消耗同时减少 HP 和物品）必须包裹在 SQLite 事务中，保证原子性。触发器可自动维护派生数据（如总重量、成就进度）。
- **后门防范**：AI 暴露层优先使用收窄过的领域工具，`update_variables` 仅作为有限白名单字段的更新通道

### 10.4 可读性与 AI 注入

为弥合关系型存储与上下文字符串的割裂感，系统提供以下转换机制：

- **序列化器（Serializer）**：在注入 AI 上下文时，将相关变量（根据 `access_level` 筛除 `hidden`）渲染为固定格式文本块。展开示例如下：

```yaml
游戏状态快照:
 角色名称: 雷伊
 等级: 25
 HP: 220/300
 MP: 60/140
 背包: 
  药草: 3
  解毒剂: 1
 已解锁技能: 火焰斩, 治疗术
```

文本块注入的是视图，不是原始数据库行。AI 上下文中的变量块由 Serializer 从当前状态派生生成，不等于数据库原始存储结构。

- **YAML/JSON 导出**：设置界面提供“导出变量状态为 YAML”，供玩家或调试人员直接阅读，内部查询数据库即时生成。

- **AI 修改反馈**：当 AI 通过工具修改变量后，编排层自动在对话流中插入一条不可见系统消息，描述变更摘要，方便回滚与调试。

### 10.5 数据库表与数据字典

基于游戏运行所需的所有持久化数据，数据库共需 **15 张核心表**，分为四个组：

#### 10.5.1 变量系统组（3 张表）

1. **`variable_def`**（变量定义表）  
    作用：存储所有游戏变量的元数据，作为变量系统的“数据字典”。  
    关键字段：`id`（主键，如 `player.hp`）、`category`、`type`（`scalar` / `tree`）、`scalar_type`、`schema`（JSON）、`access_level`、`default_value`、`description`（省略 `created_at` 等审计字段，下同）

2. **`variable_value`**（变量当前值）  
    作用：存储每个变量的完整 JSON 树。  
    关键字段：`var_id`（外键）、`value_json`（TEXT）。

3. **`variable_change_log`**（变量变更日志）  
    作用：记录每一次变量修改（用于回滚、调试、存档审计）。  
    关键字段：`id`（自增）、`timestamp`、`var_id`、`old_value`、`new_value`、`source`（`AI` / `Engine` / `System`）。

#### 10.5.2 游戏内容组（4 张表）

1. **`item_def`**（物品定义表）  
    作用：所有物品、装备、消耗品的模板数据。  
    关键字段：`item_id`、`name`、`type`（`consumable`、`weapon`、`armor`、`key_item`）、`attributes`（JSON，含攻击力、效果等）、`price`、`description`。

2. **`enemy_def`**（敌人定义表）  
    作用：所有敌人的模板数据，AI 可触发的战斗均基于此。  
    关键字段：`enemy_id`、`name`、`base_hp`、`base_mp`、`attack`、`defense`、`weaknesses`（JSON，如 `["fire","light"]`）、`skills`（JSON 技能列表）、`drops`（JSON 掉落表）、`description`。

3. **`skill_def`**（技能定义表）  
    作用：战斗技能、魔法、能力的模板。  
    关键字段：`skill_id`、`name`、`type`（`physical`、`magical`、`passive`）、`power`、`cost`、`target`、`element`、`effect_modifiers`（JSON）。

4. **`shop_def`**（商店定义表）  
    作用：快速商店的商品清单。  
    关键字段：`shop_id`、`shop_name`、`items`（JSON 数组，含 `item_id` 和 `price_override`）。

5. **`asset_ref`**（资产引用表）
 作用：存储资产文件的引用路径。
 关键字段：`asset_id`、`type`、`rel_path`、`fallback`、`tag`。

#### 10.5.3 世界与剧情组（4 张表）

1. **`chat_preset`** （对话补全预设表）
 作用：存储 **主API** 使用的对话补全预设JSON。
 关键字段：`id`、`name`、`preset_json`。

2. **`world_info`**（世界书表）  
    作用：存储世界设定、知识库条目，供 AI 上下文动态注入。 核心字段固定，扩展字段装进 JSON，对JSON的写入和修改零 `ALTER TABLE` 。
    关键字段：`id`、`name`、`enabled`、`priority`、`entry_json`。

3. **`world_info_fts`**（全文检索虚拟表）
 作用：用于极速触发搜索词检索。
 关键字段：`id`、`trigger_text`、`content_text`。

4. **`chat_history`**（聊天历史表）  
    作用：持久化存储每一轮对话消息，支持上下文恢复。  
    关键字段：`id`（自增）、`role`（`user` / `assistant` / `system`）、`content`、`timestamp`、`hidden`（布尔值）、`summary_version`（供异步总结标记）。

#### 10.5.4 存档与配置组（3 张表）

1. **`event_log`**（事件日志表）
    作用：持久化事件日志

2. **`checkpoint_snapshot`**（检查点快照表）
    作用：持久化检查点快照

3. **`save_meta`**（存档元数据表）  
    作用：存储存档描述、创建时间、游戏时长、当前主角色 ID 等，方便存档预览。  
    关键字段：`id`（一个存档一个）、`user_name`、`playtime_seconds`、`current_location`、`last_save_time`、`summary`（剧情摘要）。

### 10.6 触发器设计

SQLite 支持触发器，可用于自动维护数据完整性和日志。推荐实现以下三类触发器：

#### 10.6.1 变量变更自动日志

- **`trg_variable_change_log`**：在 `variable_value` 执行 `UPDATE` 后触发，将旧值和新值写入 `variable_change_log`，并自动记录时间戳和来源（通过应用层设置的临时变量或上下文）。

#### 10.6.2 派生变量自动维护

- 示例：当 `player.hp` 变化时，若需要自动更新 `player.max_hp` 相关成就或状态标志，可通过触发器实现。
- 但为避免逻辑分散，复杂派生逻辑***留在引擎层***，触发器仅用于不可变规则（如 `player.hp = MIN(player.hp, player.max_hp)`），可直接在业务层处理。

#### 10.6.3 数据一致性保护

- **`trg_cascade_var_delete`**：当 `variable_def` 中删除一个变量定义时，自动级联删除 `variable_value` 中的对应行，保持无悬挂引用。

- **`trg_ensure_chat_summary_version`**：当 `chat_history` 中插入新对话时，若 `summary_version` 为 `NULL`，可自动设为当前最大版本号（或由应用层设定，不用触发器也可）。

#### 10.6.4 高速触发词检索

- `tr_world_info_change`：当 `world_info` 中的 `entry_json` 发生变更时，通过触发器自动同步 `world_info_fts`：

#### 10.6.5 存档时间自动更新

- **`trg_update_save_meta`**：任何变量值变更或聊天插入后，更新 `save_meta` 中的 `last_save_time` 为当前时间戳，以保持存档预览的准确性。

### 10.8 表结构总览图

```text
变量系统: 
  variable_def
  variable_value
  variable_change_log (独立引用 var_id)

游戏内容:
  item_def (独立)
  enemy_def (独立)
  skill_def (独立)
  shop_def (引用 item_def.item_id)
  asset_ref (独立)

世界与剧情:
  chat_preset (独立)
  world_info (独立)
  world_info_fts (虚拟)
  chat_history (独立)

存档元数据:
  event_log (独立)
  checkpoint_snapshot (独立)
  save_meta (一行)
```

15 张表覆盖所有核心数据需求。数据库触发器仅用于审计、FTS 同步、不可变完整性约束等低业务含义逻辑；复杂业务规则统一保留在 Game Engine 中，避免规则分散。

---

## 11. 游戏资产管理系统

所有美术、音频、视频等大型静态资源统一存放于 **CDN/静态文件服务器**。数据库仅存储相对路径引用，运行时通过 HTTP GET 按需加载。加载失败时自动降级为占位符或静音，保证游戏永远可运行。
MVP 可使用**GitHub 仓库**静态资源或简单静态托管；长期生产环境建议迁移到更稳定的静态资源分发方案。

### 11.1 托管与加载策略

| 要素           | 方案                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------- |
| **存储位置**   | 项目 GitHub 仓库的 `/public/assets/` 目录                                                 |
| **引用方式**   | 数据库字段存储相对路径（如 `assets/img/forest_01.webp`）                                  |
| **运行时解析** | 拼接 Base URL 前后缀（如 `https://raw.githubusercontent.com/{user}/{repo}/main/public/`） |
| **加载时机**   | **懒加载**：首次需要显示/播放时才发起请求                                                 |
| **缓存策略**   | 依赖浏览器 HTTP 缓存（GitHub 提供 ETag/Last-Modified），不重复加载                        |
| 资源域白名单   | GitHub Raw、Imgur、Catbox、npm 等，可由开发者自行维护                                     |

### 11.2 资产表设计（简化）

```sql
-- 资产引用表（仅存元数据与路径）
CREATE TABLE asset_ref (
  asset_id TEXT PRIMARY KEY,           -- 唯一标识符，如 'bgm_forest_mystery'
  type TEXT NOT NULL,                   -- 'image', 'audio'
  rel_path TEXT NOT NULL,               -- 相对于 /public/ 的路径
  fallback TEXT,                        -- 降级描述文本（如图片alt、曲目名）
  tags TEXT                             -- 逗号分隔标签
);
-- 世界书等条目直接通过 asset_id 引用
```

**关键字段说明**：

- `rel_path`：直接拼接 Base URL 即可得到完整 GET 地址。
- `fallback`：图片不可用时显示的文字描述；音频不可用时在迷你播放器中显示（灰色曲目标题）。
- 不存二进制数据，不存文件大小，数据库保持轻盈。

### 11.3 运行时加载与降级流程

#### 11.3.1 图像加载（左侧面板场景图 / 战斗背景 / 角色立绘）

```text
[需要显示图片]
    │
    ├─ 若 asset_id 为空 → 显示默认占位图（CSS 渐变）
    │
    └─ 从 asset_ref 获取 rel_path
        │
        ├─ GET 请求图片
        │   ├─ 成功 (200) → 渲染图片，缓存于浏览器
        │   └─ 失败 (网络错误/404)
        │       ├─ 显示占位图（带 fallback 文字叠加）
        │       └─ 控制台静默记录（不中断游戏）
```

#### 11.3.2 音频加载（BGM / 战斗音效 / UI音效）

```text
[需要播放音频]
    │
    ├─ 若 asset_id 为空 → 静音，不报错
    │
    └─ 从 asset_ref 获取 rel_path
        │
        ├─ GET 请求音频文件
        │   ├─ 成功 → 通过 Web Audio API 播放
        │   └─ 失败
        │       ├─ BGM：静默过渡，迷你播放器显示 "无法加载"
        │       └─ 音效：直接跳过，不阻塞操作
```

**离线场景**：

- 若 GitHub 不可达，所有资产请求失败 → 全程占位图 + 静音。
- 游戏核心（对话、战斗、存档）完全不受影响。
- 需要离线且完整体验的用户 → 自行 `git clone` 并本地启动静态服务器。

### 场景 BGM 选取策略（混合模式，按优先级依次尝试）

1. **变量/位置驱动（主方案）**
    - 在 `variable_def` 中定义特殊变量 `system.location_bgm`（只读可见或完全隐藏）。
    - 世界书条目或地点切换逻辑在修改变量 `player.location` 时，通过触发器或引擎同步更新 `system.location_bgm`。
    - AudioEngine 监听该变量变化，平滑切换 BGM。
    - 此方案确定性强，适合区域主题曲稳定播放。

2. **AI 生成驱动（可选覆盖）**
    - AI 可通过专用的 `set_bgm` 工具（参数 `asset_id` 或 `track_name`）主动请求切换 BGM，用于特殊剧情时刻（如“突然紧张”、“回忆闪回”）。
    - `set_bgm` 工具执行后，会临时覆盖位置 BGM，并设置一个 `system.bgm_override` 标记。
    - 下一次位置切换或经过一定回合数后，引擎可自动清除覆盖，恢复位置 BGM。

3. **轮换/歌单兜底**
    - 当 `system.location_bgm` 为空且无 AI 覆盖时，AudioEngine 从全局“环境音乐”歌单中随机轮换播放。

### 战斗 BGM 独立处理

- **歌单隔离**：战斗 BGM 单独维护一个歌单（标签 `#bgm_battle`），与场景 BGM 完全分离。
- **状态切换**：
  - 进入 `IN_COMBAT` → AudioEngine 暂停当前场景 BGM（记录播放位置）→ 从战斗歌单中随机或按配置选曲播放。
  - 战斗结束进入 `COMBAT_RESOLVING` 或回到 `IDLE` → 战斗 BGM 停止 → 之前暂停的场景 BGM 从悬停点无缝恢复（或淡入重新开始）。
- **特殊战斗 BGM**：若怪物模板的 `enemy_def` 中指定了 `bgm` asset_id，则战斗优先使用该曲目（如 BOSS 战主题曲）。

### 音频引擎的交互约束

- 在 `GENERATING` 和 `COMBAT_RESOLVING` 状态下，不允许切换 BGM，以防止玩家在等待时产生混乱。
- 战斗中玩家无法手动更换歌单，但可在非战斗状态下通过左侧迷你播放器手动切歌（此时会设置一个 `system.bgm_manual_override` 标记，优先级最高）。

### 歌单管理建议

- 在 `asset_ref` 中利用 `tags` 字段区分歌单，例如 `bgm_ambient, bgm_location` 与 `bgm_battle`。
- 允许用户通过资产管理 UI 创建自定义歌单（实质是添加/编辑标签），并将标签指定给某一变量值或 AI 工具调用。

---

## 12. 非剧情相关系统  

所有系统均不调用 LLM，纯本地运行，以零成本提供游玩深度。

- **动态仪表盘**：Chart.js 或简单 Canvas 绘制属性雷达图、声望趋势、收集进度。  
- **快速商店**：从 SQLite 商品表加载，玩家可买卖常规物品，结果同步更新 Pinia，并在对话流中插入不可见的系统日志。  
- **训练场**：自由战斗模式，可使用任何已解锁敌人/固定敌人的高塔挑战进行无消耗对战，不影响真实存档，帮助玩家熟悉弱点机制。  
- **角色状态/背包**：提供完整的装备、属性检视和道具使用界面。

---

## 13. 安全模型  

### 13.1 XSS 与注入防范  

- 所有用户输入和 AI 输出在渲染为 HTML 前，必须通过 `DOMPurify` 清理。  
- Markdown 渲染仅允许安全标签，链接添加 `rel="noopener noreferrer"` 属性。  
- 禁止在对话中执行 `<script>` 或内联事件。

### 13.2 CSS 注入防范  

- 若允许对话补全预设或世界书引入自定义样式，必须将其作用域限制在 Shadow DOM 内部，防止全局样式劫持。

### 13.3 API Key 安全  

- 使用 Web Crypto API 的 PBKDF2 派生加密密钥，将 API Key 加密后存入 IndexedDB。  
- 内存中仅在会话期间持有明文，页面刷新或关闭即销毁。
- 注意：浏览器端 API Key 加密属于“降低误暴露风险”的安全措施，而非绝对安全边界。系统应明确采用 BYOK 模式，由用户自行承担第三方 API Key 的使用风险。高级部署模式可选配本地代理或自托管后端代理，以避免 API Key 长期暴露在浏览器运行时。

### 13.4 内容安全策略 (CSP)  

- 限制可加载资源来源，默认禁止白名单（用户可自定义，开发者不对此行为负责）外部的图片/字体。
- 默认 CSP 仅允许加载本应用同源资源。  
- 若用户启用远程资产库，则系统将该资产库 Base URL 加入运行时白名单，并在设置界面明确提示远程资源加载风险。  
- 官方预设资产应尽量通过构建产物或可信 CDN 分发，避免依赖 GitHub Raw 作为长期生产资源源站。

### 13.5 Prompt Injection 与工具调用防护

- 世界书、用户输入、AI 输出均视为不可信文本。  
- System Prompt 中应明确声明：用户文本和世界书内容不得覆盖系统规则、工具权限和变量访问级别。  
- Tool Call 执行不以模型理由为准，只以本地 Schema、权限表、业务规则、当前 FSM 状态、当前上下文和幂等为准。  
- 所有工具调用必须绑定 `request_id`、`context_version`、`state_hash`、`tool_call_id`，若执行时状态已变化，则拒绝或重新校验。
- 即使模型重复输出同一工具调用，只要 tool_call_id 已执行过，也必须拒绝重复执行。

---

## 14. 领域事件与命令模型

本系统严格遵守命令查询职责分离 (CQRS) 和事件溯源的部分原则，确保所有状态变更可追溯、可重放、可回滚。

### 14.1 核心概念关系

```text
[用户/ AI Tool Call]
        │
        ▼
[DomainCommand]   (意图封装，待校验)
        │
        ▼
[Game Engine ── 校验、执行]
        │
        ▼
[GameEvent]      (事实记录，不可变)
        │
        ├── 更新 Pinia 内存状态
        ├── 生成/更新 Checkpoint 快照
        └── 异步持久化到 SQLite
```

- **DomainCommand**：表示“意图”，由 UI 或 AI 工具调用产生，如 `TriggerBattle`、`UpdateVariables`。它是纯数据对象，不含执行逻辑。
- **GameEvent**：一次成功执行的命令会产生一个或多个 `GameEvent`（如 `BattleStarted`、`VariableChanged`、`BattleEnded`）。事件是不可变的，包含事件类型、时间戳、负载以及对应命令的 ID。
- **Checkpoint**：是某个时刻全部状态的可序列化快照（基于当前所有事件的归并结果）。它直接供回滚使用，避免重放大量事件。每个检查点关联一个事件版本号。
- **BattleResult**：是 `BattleEnded` 事件负载的一部分，包含战斗统计、胜败标志、存活状态、经验/金钱/掉落等数据。它被 Game Engine 从战斗 Store 提取并作为事件发布，绝不直接修改全局状态。

### 14.2 约束与实现

- 任何修改游戏状态的操作必须通过命令，由 Engine 统一处理。编排层和 UI 层不得绕过此通道。
- Engine 在命令执行前进行三阶段校验：Schema 校验、权限校验（变量访问级别）、FSM 状态校验（当前状态是否允许此命令）。
- 命令执行失败时，Engine 抛出标准 `CommandRejectedError`，由编排层捕获并转入恢复流程，不产生任何事件。
- Checkpoint 使用 `immer` 或手写的不可变数据生成，仅在特定时机（idle_checkpoint, combat_checkpoint, save_checkpoint）创建，以保证回滚性能。
- 可通过事件日志实现时间旅行调试（开发者模式下），重放事件到任意状态。
- 并非所有运行时状态变化都必须持久化为事件；MVP 采用“命令驱动 + 必要事件审计 + 快照恢复”的折中模式。

---

## 15. 失败模式与恢复策略

每种失败模式都定义了系统自动处理策略和用户可执行的恢复选项，保证游戏进程不丢失。

| 失败模式                                             | 自动策略                                                                                                                                                                     | 用户体验策略                                                                                                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AI 请求失败** (网络错误、4xx/5xx)                  | 立即停止当前流；外层转入 `ERROR_RECOVERY`。                                                                                                                                  | 用户界面显示错误详情，提供“重试”、“编辑输入后重试”、“回滚到上次 IDLE 检查点”按钮。回滚将丢弃所有临时对话和状态变更。                                    |
| **流式中断** (连接断开)                              | 已接收部分文本保留在临时消息中，系统转入 `ERROR_RECOVERY`。                                                                                                                  | 同上，但用户可见部分生成文本。可选择“基于已有文本继续”、“重试”或“回滚”。                                                                                |
| **Tool Call 参数非法** (Zod 校验失败)                | 忽略该工具调用；若所有调用均非法，转入 `ERROR_RECOVERY`。若存在部分合法调用，则执行合法调用，非法部分在系统消息中记录警告。                                                  | 在聊天中插入不可见系统消息：“AI 尝试执行非法操作已被拦截”。若因此中断对话，可按通用策略重试。                                                           |
| **重复 Tool Call**                                   | 按 `tool_call_id` 拒绝重复执行                                                                                                                                               | 通常无感知，仅记录日志                                                                                                                                  |
| **状态绑定失效**（如 `state_hash` 已变化，请求过期） | 拒绝该工具调用并转 `ERROR_RECOVERY`                                                                                                                                          | 提示“上下文已变化，请重试”                                                                                                                              |
| **副 API 失败** (双 API 模式)                        | 自动回退到主 API 的变量更新 Tool Call（如果主 API 提供了）。若主 API 也未提供或同样失败，转入 `ERROR_RECOVERY`。                                                             | 界面提示“数值更新失败”，用户可手动重试副 API 或跳过（保留上一状态）。                                                                                   |
| **SQLite 写入失败** (配额/IO 错误)                   | 自动重试 2 次（间隔递增）。若仍失败，将当前 Engine 状态序列化到 IndexedDB 作为应急备份，并阻止自动存档同时触发错误提示。                                                     | 通知用户存储空间不足或写入错误，提供“导出存档”、“刷新重试”、“清除过期存档”选项。游戏可继续运行但不会持久化，直到问题解决。                              |
| **存档损坏** (导入/加载)                             | 加载时校验数据库头/ schema 版本，若不符则拒绝加载，不覆盖当前存档。                                                                                                          | 提示存档无效，引导用户手动选择其他存档或开始新游戏。提供“尝试修复”选项：若仅变量数据损坏，尝试重建表并从聊天记录恢复部分状态（LTS 功能，非 MVP 必须）。 |
| **战斗中刷新页面**                                   | 页面加载时检测 `combat_checkpoint` 是否存在且未正常结束（检查 `save_meta` 中的战斗状态标志）。若存在，重新加载战斗 Store 快照，恢复至 `COMBAT_PENDING` 或 `IN_COMBAT` 状态。 | 刷新后用户直接回到战斗界面，或如果战斗已无法恢复（如步数不一致），则根据战斗检查点回滚到战斗触发前状态，并插入系统消息说明。                            |
| **Provider 返回格式不兼容** (非标准 JSON)            | AI SDK 将抛出解析错误，编排层捕获后转入 `ERROR_RECOVERY`。                                                                                                                   | 提示“AI 返回格式异常”，建议用户更换 Provider 或模型，并提供编辑请求内容后重试。                                                                         |
| **用户 API Key 无效** (401/403)                      | 编排层在首次请求失败时捕获，返回标准错误码。                                                                                                                                 | 提示“API Key 无效或权限不足”，直接导航到设置界面让用户更新 Key，不进入复杂恢复。                                                                        |
| **资产加载失败** (CDN 不可用)                        | 图片/音频请求失败时，自动使用占位符/静音，记录控制台日志。                                                                                                                   | 游戏完全可运行，左侧面板显示“资源加载失败”图标，BGM 静音但不影响操作。显示持久通知条：“部分媒体资源无法加载”，用户可手动切换资产源。                    |

所有恢复流程均保证数据安全，即使手动回滚也利用检查点精确恢复，不会丢失玩家主动操作（如使用道具）的意图（主动操作在 `IDLE` 状态下执行，不随 AI 失败回滚）。

---

## 16. 非功能需求

| 类别         | 指标              | 具体要求                                                                                                                  |
| ------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **性能**     | 首屏加载时间      | FCP < 1.5s，TTI < 2.5s (桌面端)；< 3s (移动端)。非核心资源懒加载。                                                        |
|              | 数据库写入耗时    | 单条记录写入 < 5ms，事务提交（含多表） < 30ms。自动存档后台执行，不阻塞 UI。                                              |
|              | Prompt 构建耗时   | 从停止输入到开始流式响应（TTFB）< 300ms，其中本地处理（注入世界书、序列化状态）< 50ms。                                   |
|              | 战斗帧响应        | 按钮点击至 UI 反馈 < 100ms。                                                                                              |
| **可靠性**   | 存档损坏恢复      | 自动检测 checksum，优先加载上次完好自动存档，若无则提示用户选择存档。                                                     |
|              | 事务失败回滚      | SQLite 所有变更使用 `BEGIN/COMMIT/ROLLBACK`，写失败后状态保持一致。游戏引擎内存状态在提交确认前可回滚至检查点。           |
|              | 数据备份          | 每 N 次对话 / 战斗结束自动触发后台备份，保留最近 3 个版本。                                                               |
| **一致性**   | 原子化提交        | 关键命令提交必须具备原子性                                                                                                |
|              | 状态一致性        | 不允许聊天正式记录与状态写入出现“只成功一半”的情况                                                                        |
| **安全**     | XSS 防范          | DOMPurify 净化所有渲染内容；CSP 限制内联脚本和未知域资源；使用 `Content-Security-Policy` meta 标签。                      |
|              | Prompt Injection  | 用户输入被视为纯文本，禁止解释为系统指令；AI 输出严格校验，只提取可识别工具调用和文本；世界书条目不能包含可执行代码标签。 |
|              | API Key 风险      | 使用 PBKDF2 加密存储于 IndexedDB，加载时解密到内存，不持久化到日志或导出文件。建议启用内容过滤和请求限额。                |
| **可观测性** | 关键id可追踪      | 每次请求必须可追踪 request_id；每次工具执行必须可追踪 tool_call_id                                                        |
|              | 工作流诊断        | Prompt 组装与工具执行链应支持开发模式诊断                                                                                 |
| **可维护性** | 模块边界          | 表现层、引擎层、编排层、持久层通过接口和事件总线通信，禁止循环依赖。每层可独立替换。                                      |
|              | 测试覆盖率        | 核心引擎单元测试覆盖率 > 90%；状态机覆盖率 > 95%；集成测试覆盖所有主要数据流路径。                                        |
|              | 代码规范          | ESLint + Prettier 统一风格；强制 TypeScript 严格模式；提交前 pre-commit hooks 运行 lint 和部分测试。                      |
| **可移植性** | 浏览器兼容        | Chrome 100+, Firefox 90+, Edge 100+, Safari 15.4+。均需支持 WebAssembly、OPFS、Web Workers、Web Crypto API。              |
|              | 移动端适配        | 响应式布局，768px 以下自动切换为底部导航栏模式；战斗 UI 为卡片式紧凑布局，支持触摸操作。                                  |
|              | 离线能力          | 纯本地状态运行（不需后端）；通过 PWA Service-Worker 缓存核心 HTML/JS/CSS 实现离线启动，资产加载失败有降级处理。           |
| **成本**     | 主 API Token 预算 | 默认单次请求不超过 3000 tokens 输入 + 8000 tokens 输出；用户可调整，当超出阈值时发出应用内警告。                          |
|              | 副 API Token 预算 | 默认不超过 1000 tokens 输入 + 300 tokens 输出；使用更便宜的模型。                                                         |
|              | 本地计算          | 所有战斗计算、变量更新均为本地运算，零 API 消耗。                                                                         |

---

## 17. 技术栈  

### 前端  

- **框架**：Vue 3 (Composition API + `<script setup>`)  
- **状态管理**：Pinia  
- **样式**：SCSS + TailwindCSS  
- **UI 组件**：可选用 Headless UI / Radix Vue 增强无障碍性  

### 数据与本地  

- **SQLite**：`@sqlite.org/sqlite-wasm` (OFFICIAL WASM BUILD)  
- **变量定义**: JSON Schema
- **文件打包**：`jszip`  
- **安全存储**：IndexedDB + Web Crypto  

### AI 集成  

- **多提供商支持**：Vercel AI SDK (`ai` + `@ai-sdk/openai-compatible`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/deepseek` 等)
- **双API路由**： 支持为“主 API”和“副 API”分别配置不同的 Provider 及模型参数。
- **Token 计算**：`js-tiktoken` （用于手动语境管理，SDK 也提供部分 Token 统计辅助）)
- **Tool Call 校验**：`Zod` （作为 AI SDK 的工具 Schema 定义语言）
- **渲染清洗**：`DOMPurify`  

### 开发与测试  

- **构建**：Vite  
- **包管理**：pnpm  
- **测试**：Vitest (单元+集成)，Playwright (E2E)  
- **代码风格**：ESLint + Prettier  

---

## 18. 开发流程与质量保证  

### 18.1 测试金字塔  

- **单元测试**（覆盖最多）：战斗公式、Token 计数器、状态转换函数、Zod Schema 验证、Tool Envelope 幂等测试。  
- **集成测试**：使用内存数据库与模拟 Provider 测试完整工作流（Pinia + 编排层 + 假 API 响应）。
- **端到端测试**：Playwright 脚本模拟玩家从发送消息到进入战斗的完整路径。

### 18.2 开发辅助  

- 战斗模拟器内置 **AI 替身**功能，可用预设 JSON 响应快速验证战斗流程，无需消耗 API 额度。  
- 约定的日志系统（`[ORCH]`, `[BATTLE]`, `[DB]` 前缀）在开发模式下输出结构化信息。

### 18.3 兼容性保证  

- 目标浏览器：Chrome / Firefox / Edge 最新两个大版本，Safari 15+。  
- 保证在 SillyTavern 插件 iframe 沙盒中可通过 AJAX 加载。

### 18.4 MVP范围

#### MVP 必须有

- 本地存档；
- AI 对话；
- 世界书基础注入；
- 基础变量系统（统一 JSON）；
- `trigger_battle`；
- 收窄后的变量更新能力
- Press Turn 战斗 MVP；
- 战斗结算系统摘要
- 半自动续写；
- 存档导出;
- 基础错误恢复.

#### MVP 暂不做

- 双 API 模式
- 异步总结
- 训练场与挑战
- 完整资产管理 UI；
- 自定义歌单；
- 复杂 Modifier；
- 时间旅行调试
- 多 Provider 全适配；
- SillyTavern 深度兼容；
- 动态变量定义；
- 移动端完整战斗优化。

### 18.5 敏捷开发阶段

#### Sprint 0：技术验证

目标：验证最难的技术风险。

- SQLite Wasm + OPFS + Worker 最小 Demo；
- BYOK 调用一个 Provider；
- 流式输出 + Tool Calling Demo；
- Pinia 与 Worker 状态同步 Demo；
- 存档导入导出 Demo。
产出：技术可行性报告。

#### Sprint 1：状态机 + 命令总线 + Checkpoint

- FSM；
- Game Engine 命令总线；
- Checkpoint；
- Event Log；
- 基础变量系统。
产出：无 AI 的本地可运行骨架。

#### Sprint 2：聊天消息生命周期 + Prompt Builder + 单 API 流式闭环

- Prompt Builder；
- 世界书检索；
- 流式消息；
- provisional message；
- finalize message；
- chat history；
- Tool Call 校验但不接战斗。
产出：可对话、可保存、可恢复。

#### Sprint 3：变量系统 + Worker 提交确认 + 基础持久化一致性

- 统一JSON存储；
- Worker `commitAck` 实现
-

#### Sprint 4：战斗系统 MVP

- Press Turn 核心规则；
- 敌人模板；
- 技能模板；
- 战斗 UI；
- 战斗测试用例。
产出：无 AI 也能完整战斗。

#### Sprint 5：AI 触发战斗 + 战后半自动续写

- `trigger_battle`；
- `BattleResult`；
- 战斗后叙事续写；
- 失败恢复。
产出：核心玩法闭环。

#### Sprint 6：内容系统与体验优化

- 商店；
- 背包；
- 训练场/模拟器；
- BGM；
- UI 动画；
- 战斗结束后自动续写；
- 副 API 变量提取；
- 持久化 event replay；
- 高级 Prompt 模板语法；
- 内容包/模组机制；
- 移动端适配。

---

## 19. 未来可扩展方向（不纳入当前里程碑）

- **SillyTavern 全生态兼容**：由社区 `sillytavern-web` Skill 实现，本项目仅需保留对话流 JSONL 导出接口。  
- **多语言支持**（i18n）。  

---
