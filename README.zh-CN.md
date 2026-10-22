# dsh-group-tab — 工作群

[![npm](https://img.shields.io/npm/v/dsh-group-tab?color=cb3837&label=npm)](https://www.npmjs.com/package/dsh-group-tab)
[![ci](https://github.com/llCCII/dsh-group-tab/actions/workflows/ci.yml/badge.svg)](https://github.com/llCCII/dsh-group-tab/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-plugin-4d8dff)](https://github.com/deepseek-ai/deepseek-harness)

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）右侧栏加一个 tab：**谁在干活、每个人现在做到哪、大概还要多久**，用群聊的形态实时呈现，而不是一份静态日志。

![工作群，深色](https://cdn.jsdelivr.net/gh/llCCII/dsh-group-tab@main/preview/workgroup-dark.png)

它注册在 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 上（那个插件对外提供 tab 注册点，第三方 tab 都走它）。

## 为什么

主代理派了三个子代理、又起了两个后台任务时，DSH 的会话视图只讲其中一个；想知道「有没有东西卡住」得开四个会话。

这个 tab 一个地方回答：

- 每个成员一张卡（主代理 + 树里所有子代理），显示**此刻正在跑的 tool**
- 每个成员的 ETA，按**本机自己**的历史完工时长算（最近 20 次取中位），没有历史时明确标注是按经验值估的
- 后台任务折叠到发起它的成员身上
- 一条合并的时间线：开始干活 / 换工具 / 说话 / 任务进度 / 收工，最新的在最下面
- 每个成员实际在用的模型（`provider / model`）
- **在等你**（提问或审批）的成员置顶 + 红色角标 + 头部计数；子代理收工可选提示音

## 安装

```sh
dsh plugin --profile web add dsh-better-sidebar   # 必需：tab 宿主
```

再装本插件，npm 或直接从 GitHub 二选一：

```sh
dsh plugin --profile web add dsh-group-tab                              # npm（发布后）
dsh plugin --profile web add github:llCCII/dsh-group-tab                # 直接走 GitHub，不需要 npm
```

然后右侧栏 `＋` 菜单里选 **工作群**（和「任务管理」并列）。每次页面加载会在当前会话自动打开一次；一旦有派活，会按会话自动打开一次；你手动关掉后本页不再抢开（手动再打开即恢复）。

## 数据来源

| 来源 | 方式 | 拿到什么 |
| --- | --- | --- |
| `sessions` 客户端服务 | 订阅（事件驱动） | 有哪些会话、谁在跑、标题、父子关系 |
| `jobs` 客户端服务 | 订阅（事件驱动） | 每个会话的后台任务清单 |
| `POST /sidebar/api/subagents.live` | 轮询，**只在有人跑时** | 每个成员当前工具 + 最后一句 |
| `POST /sidebar/api/git.models` | 每成员一次，30 秒缓存 | 成员实际用的模型路由 |

**空闲不花钱。** 2 秒轮询和 1 秒时钟只在「至少有一个成员或后台任务在跑」时存在；页面切到后台（`visibilitychange`）也会停。空闲面板零请求 —— 有人开始跑时，会话列表的事件会把它唤醒。页脚写着 `LIVE · 2s`（在跑）或 `LIVE · 空闲不轮询`。

## 说明

- **没有宿主端（host）逻辑、不落文件**：面板完全由实时事件推导，不会显示过期状态。
- 时间线只存在内存里（上限 200 条），每个成员的起始时间写 `localStorage`，刷新页面不会把计时清零。
- 提示音用 Web Audio 现场合成（无音频资源），头部铃铛按钮可静音。
- 界面语言跟浏览器走（`zh*` 中文，其他英文）。

## 开发

```sh
npm test          # 离线 harness：假 React + 假宿主，跑真 bundle
```

`test/render-check.mjs` 用真实 `lib/client.js` + 假 React/假 DOM/假宿主数据跑渲染，然后断言渲染出的文本：成员、ETA、模型、时间线去重、置顶、以及空闲时确实不再轮询。`test/i18n-check.mjs` 断言英文词条被选中。

## 发布前清单

- [ ] 在 `package.json` 补 `repository` / `homepage`
- [ ] `npm publish`（已经是可发布状态：去掉了 `private`、给了 `files`、MIT）
- [ ] 打 tag 发版，`preview/*.png` 同步更新

## License

MIT
