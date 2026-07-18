# 隐藏挑战谜题下载入口设计

## 目标

将 `public/puzzle.png` 接入训练场隐藏挑战解锁流程。玩家完成五个普通挑战后获得线索，通过浏览器 DevTools 的 Elements 面板找到 HTML 注释中的 `/hiddenchallenge`，将该路径接到当前站点地址后访问。页面随即下载谜面图片、恢复原始页面地址并继续启动游戏。玩家解出图片谜题并输入 `OUR MEMORIALS` 后，隐藏 Boss 挑战永久解锁。

## 静态线索

在根 `index.html` 中加入以下静态 HTML 注释：

```html
<!-- /hiddenchallenge -->
```

注释必须直接存在于服务端返回的 HTML 中，使玩家无需依赖 Vue 组件渲染即可在 Elements 面板查看。训练场线索文案仅引导玩家检查 Elements 面板中的注释，不直接显示入口路径或图片地址。

## 下载入口

新增一个独立、可测试的浏览器入口处理单元，并在 `main.ts` 的应用初始化流程最前端调用。

入口规则：

1. 检查 `window.location.pathname` 是否以 `/hiddenchallenge` 结尾。
2. 普通路径立即返回，不创建元素、不修改历史记录。
3. 命中入口后，创建同源临时 `<a>` 元素，链接到基础路径下的 `puzzle.png`，并设置 `download="puzzle.png"`。
4. 将链接短暂加入文档、调用 `click()`，随后移除。
5. 保留现有 query 与 hash，并用 `history.replaceState` 从 pathname 尾部去掉 `/hiddenchallenge`；若去除后为空，则恢复为 `/`。
6. 入口处理结束后继续执行现有 Vue、Pinia、持久化和技能注册初始化流程。

该方案不向 Vue Router 增加路由，因为项目使用 `createMemoryHistory()`，地址栏路径应在路由初始化前独立处理。

## 谜题配置

`TRAINING_PUZZLE` 调整为：

- `enabled: true`
- `imageUrl: "/puzzle.png"`
- `normalizationVersion: 1`
- `answerDigest: "60956c648459ec2cfae4cbda4bf29c0fe13c288d5cf1d71739c8ddb0c5bc0c4b"`

该摘要对应 normalization v1 处理后的 `our memorials`。现有规范会裁剪首尾空白并按 `en-US` 转成小写，因此大小写不同或首尾带空格的 `OUR MEMORIALS` 仍视为正确答案；单词间空格仍是答案的一部分。

## 解锁与持久化

沿用现有 `TrainingSessionService.submitPuzzleAnswer()`：

- 五个普通挑战未全部完成时不显示线索入口。
- 答案摘要不匹配时返回 mismatch，不改变进度。
- 匹配后写入 `training.hiddenChallengeDiscovered = true`。
- 已解锁存档再次提交时保持幂等。
- 隐藏挑战的显示与可选状态继续由持久化字段控制。

## 异常与部署约束

- 下载链接使用同源 URL 和 `download` 属性，不引入网络 API 或额外资源服务。
- 地址恢复使用 `replaceState`，避免在浏览器历史中留下会重复下载的入口记录。
- 部署服务器需要继续把 `/hiddenchallenge` 回退到 SPA 的 `index.html`；Vite 开发服务器与 preview 环境满足该行为。
- 若浏览器限制自动下载，页面仍恢复并正常启动，玩家可以再次访问入口重试。

## 测试

1. 单元测试普通路径没有 DOM 和 history 副作用。
2. 单元测试 `/hiddenchallenge` 创建并点击下载链接，资源为 `puzzle.png`。
3. 单元测试子路径入口去除入口后恢复基础 pathname，并保留 query/hash。
4. UI 测试确认完成五次挑战后表单暴露配置的 `/puzzle.png` 资源提示。
5. 训练服务测试使用真实摘要函数验证 `OUR MEMORIALS`、大小写变体和首尾空白可以解锁并持久化。
6. 内容规则测试确认启用后的谜题配置完整有效。

## 范围外事项

- 不修改谜面图片内容。
- 不新增 Vue 路由或下载确认页面。
- 不修改五个普通挑战的解锁和奖励规则。
- 不改变隐藏 Boss 的战斗配置。
