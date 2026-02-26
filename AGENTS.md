# 残机物语 — 工程交接说明 (AGENTS.md)

本文档供 AI 或开发者接手本工程时快速理解结构与扩展方式。

---

## 1. 项目概述

- **类型**：数据驱动的 2D 格子生存/探索游戏（HTML + 原生 JS，无框架）
- **标题**：残机物语 v1.4 - 数据驱动版
- **运行**：用本地 HTTP 服务打开 `index.html`（需能 `fetch` 到 `data/*.json`）

---

## 2. 目录与职责

| 路径 | 职责 |
|------|------|
| `index.html` | 页面结构：顶栏、主舞台网格、信息面板、日志、弹窗（睡眠/选择/仓库） |
| `style.css` | 样式 |
| `main.js` | **引擎** `Engine`：加载 data、场景、时间、状态、`run(cmds)` 指令、移动与交互 |
| `ui.js` | **界面** `UI`：渲染菜单/背包/体征、弹窗、面板拖拽、日志/信息面板弹出窗 |
| `data/*.json` | 全部游戏内容与配置，见下文 |

脚本顺序：先 `ui.js` 再 `main.js`；`window.onload` 调用 `Engine.init()`。

---

## 3. 数据文件 (data/)

引擎在 `Engine.init()` 中一次性 `fetch` 以下 JSON（见 `main.js` 第 8 行）：

| 文件 | 用途 |
|------|------|
| `config.json` | `startScene`, `startIndex`, `sys_actions`（全局「个人动作」如检查身体） |
| `scenes.json` | 场景表。每场景：`name`, `desc`, `cols`, `grid`（格子数组） |
| `npcs.json` | NPC/玩家定义：`sn`, `fn`, `is_player`, `race`, `tags`, `action_ids` |
| `objects.json` | 物体：`sn`, `fn`, `weight`, `blocking`, `onStep`, `action_ids`；容器有 `capacity` |
| `actions.json` | 动作：`label`, `turn_cost`, `cmd`（指令数组）；或 `effect`（如 `heal_limb`, `open_container`） |
| `buffs.json` | `definitions`（buff/debuff：duration、effects、requirements）、`sensations`（身体描述） |
| `races.json` | 种族及 `base_stats`（肢体、饱食、饮水、疲劳、背包、负重等） |

玩家由 `npcs` 中 `is_player: true` 的条目指定，其 `race` 对应 `races.json`，`Engine.state` 由此初始化。

---

## 4. 核心逻辑摘要

- **当前场景**：`Engine.cur`（来自 `scenes[id]` 的深拷贝），玩家格子下标 `Engine.pIdx`。
- **格子**：`grid[i]` 可为空地、出口（`acts` 含 `move`）、`object_id`、`npc_id`；可带 `action_ids` 或内联 `acts`、`onStep`。
- **移动**：点击相邻格或 WASD/方向键；每格耗 10 分钟（腿伤有系数），触发 `advanceTime` 和当前格 `onStep`。
- **时间**：`Engine.advanceTime(mins)` 推进时间，扣饱食/饮水、加疲劳，并推进 buff 的 `on_tick` 与 duration。
- **动作**：`Engine.performAction(actionId, context)` 会推进时间、执行 `action.cmd` 或特殊 effect（睡觉、治疗肢体、打开容器等）。
- **指令**：`Engine.run(cmds)` 支持 `log`、`move`、`advance_time`、`mod_stat`、`hp_limb`、`add_to_inventory`、`remove_from_inventory`、`take_item_from_ground`、`move_item_to_container`、`move_item_from_container`、`recover_limbs_ratio`、`call_action`、`add_buff`、`remove_buff`、`check_body_text`。指令可带 `condition`（如 `has_buff`/`not_has_buff`）。

---

## 5. 扩展指南

- **新场景/新格子/新出口**：改 `data/scenes.json`。
- **新物体/新 NPC**：改 `data/objects.json`、`data/npcs.json`，在场景 `grid` 中引用 `object_id`/`npc_id`。
- **新动作**：在 `data/actions.json` 增加条目，用 `cmd` 或 `effect`；在物体/NPC/格子的 `action_ids` 或 `acts` 中引用。
- **新指令类型**：在 `main.js` 的 `Engine.run()` 的 `switch(c.type)` 中增加 `case`。
- **新 effect**：在 `Engine.performAction()` 中增加分支（如 `heal_limb`、`open_container`、`bed_sleep`）。
- **新 buff/身体感受**：改 `data/buffs.json`（`definitions`、`sensations`）。
- **新种族/初始状态**：改 `data/races.json`。
- **UI 变更**：`index.html` 结构、`ui.js` 渲染与事件、`style.css` 样式。

---

## 6. CSV 同步工具

- 项目根目录有 `csv-sync.js`，用于将 `data/*.json` 与 CSV 互导，便于用 Excel/WPS 批量增改内容。
- 命令：`node csv-sync.js export all` 导出全部 CSV；`node csv-sync.js import all` 从 CSV 写回 JSON。也可单独指定 `config|npcs|objects|actions|races|buffs|scenes`。
- 对应文件：config.csv、npcs.csv、objects.csv、actions.csv、races.csv、buffs_definitions.csv、buffs_sensations.csv、scenes_meta.csv、scenes_grid.csv。

---

## 7. 约定与注意

- 物品同时支持 `Engine.db.objects` 与 `Engine.db.items`（部分逻辑两处都查）。
- 容器实例：场景 `grid` 中格子若有 `object_id` 指向带 `tags: ["container"]` 的物体，该格可存 `inventory`；仓库 UI 用 `container_id: "grid_<index>"` 与 `Engine.cur.grid[index]` 对应。
- 所有 JSON 为 UTF-8，游戏内文案为中文。

---

接手后优先阅读：`main.js`（Engine）、`ui.js`（UI）、`data/config.json` 与 `data/scenes.json`。需要改玩法或加系统时，在 `Engine.run` 与 `performAction` 中扩展即可。
