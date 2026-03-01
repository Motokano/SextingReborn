# 潮碧物语 — 工程交接说明 (AGENTS.md)

本文档供 AI 或开发者接手本工程时快速理解结构与扩展方式。

---

## 1. 项目概述

- **类型**：数据驱动的 2D 格子生存/探索游戏（HTML + 原生 JS，无框架）
- **标题**：潮碧物语
- **运行**：用本地 HTTP 服务打开 `index.html`（需能 `fetch` 到 `data/*.json`）

---

## 2. 目录与职责

| 路径 | 职责 |
|------|------|
| `index.html` | 页面结构：顶栏、主舞台网格、信息面板、日志、弹窗（睡眠/选择/仓库） |
| `style.css` | 样式 |
| `main.js` | **引擎入口**：仅定义 `Engine`、`Engine.init()`、`Engine.run(cmds)` 并委托到各模块；不实现具体游戏逻辑 |
| `ui.js` | **界面** `UI`：渲染菜单/背包/体征、弹窗、面板拖拽、日志/信息面板弹出窗 |
| `*-utils.js` | 工具：`inventory-utils`、`character-utils`、`skill-utils`（纯查询/计算，可传 state） |
| `*-actions.js` | run 命令实现：`inventory-actions`、`crafting-actions`、`status-actions`、`skill-actions`、`buff-actions`；与 `game-actions.js` 一起合并进 `Engine.runHandlers` |
| `effects.js` | 效果与肢体伤害：`Effects.apply`、`Effects.applyLimbDamage` |
| `movement.js` | 移动、时间、场景、地面效果：`Movement.advanceTime`、`loadScene`、`click`、`dist` 等 |
| `menu-controller.js` | 菜单与上下文选项：`MenuController.update()` |
| `item-controller.js` | 物品操作：`ItemController.showItemActions`、`useItem` |
| `action-dispatcher.js` | 玩家动作分发：`ActionDispatcher.perform`（特例如 heal_limb、open_container、bed_sleep 等） |
| `data/*.json` | 全部游戏内容与配置，见下文 |

脚本顺序：见 `index.html`；`ui.js` → `cognition.js` → `game-actions.js` → 各 utils/actions/effects/movement/menu/item/action-dispatcher → `main.js`；`window.onload` 调用 `Engine.init()`。

---

## 3. 数据文件 (data/)

引擎在 `Engine.init()` 中一次性 `fetch` 以下 JSON（见 `main.js` 第 8 行）：

| 文件 | 用途 |
|------|------|
| `config.json` | `startScene`, `startIndex`, `sys_actions`（全局「个人动作」如检查身体） |
| `scenes.json` | 场景表。每场景：`name`, `desc`, `cols`, `grid`（格子数组） |
| `npcs.json` | NPC/玩家定义：`sn`, `fn`, `is_player`, `race`, `tags`, `attributes`（个体属性，见 3.1）, `action_ids` |
| `objects.json` | 物体：`sn`, `fn`, `weight`, `blocking`, `onStep`, `action_ids`；容器有 `capacity` |
| `actions.json` | 动作：`label`, `turn_cost`, `cmd`（指令数组）；或 `effect`（如 `heal_limb`, `open_container`） |
| `buffs.json` | `definitions`（buff/debuff：duration、effects、requirements）、`sensations`（身体描述） |
| `races.json` | 种族及 `base_stats`（肢体、饱食、饮水、疲劳、背包、负重等） |
| `character_attributes.json` | 个体属性定义：各属性（如年龄、体型）的可选值及对数值的修正（`_mult` / `_mod`） |

玩家由 `npcs` 中 `is_player: true` 的条目指定，其 `race` 对应 `races.json`，`Engine.state` 由种族 `base_stats` 初始化，再经 `Engine.applyCharacterAttributes(state, playerDef)` 按 NPC/玩家的 `attributes` 施加个体修正。

---

### 3.1 标签 vs 个体属性（人物/NPC）

- **标签 (tags)**：如 `["人类","男性"]`，用于判定（如 buff 的 `required_tags` / `forbidden_tags`），不直接改数值。种族 `race` 决定一套**基础属性**（来自 `races.json` 的 `base_stats`），可视为“种族标签带来的基础”。
- **个体属性 (attributes)**：在 `npcs.json` 中为每个角色单独写，如 `"attributes": { "age": "old" }`。在 `data/character_attributes.json` 中为每种属性的每个取值定义**修正**（如老年：负重系数 0.8、疲劳增长 1.2 倍、移动时间 1.2 倍）。初始化/获取状态时，先套用种族 `base_stats`，再按 `attributes` 应用这些修正。

---

### 3.2 人物属性列表（state 中与扩展用）

| 属性 | 说明 | 来源 |
|------|------|------|
| `limbs` | 各部位当前血量（head, chest, stomach, l_arm, r_arm, l_leg, r_leg） | 种族 base_stats |
| `maxLimbs` | 各部位上限 | 种族 base_stats |
| `fullness` | 饱食度 0–100 | 种族 base_stats |
| `hydration` | 饮水度 0–100 | 种族 base_stats |
| `fatigue` | 疲劳 0–100 | 种族 base_stats |
| `inventory` | 背包物品 { item_id: count } | 种族 base_stats |
| `inventory_size` | 背包格数（可被个体属性 `inventory_size_mod` 修正） | 种族 base_stats + 个体 _mod |
| `max_weight` | 负重上限（可被个体属性 `max_weight_mult` 修正） | 种族 base_stats + 个体 _mult |
| `current_weight` | 当前负重 | 运行时 |
| `buffs` | 当前身上的 buff 列表 | 种族 base_stats（空数组）+ 运行时 |
| `fatigue_gain_mult` | 疲劳增长速度倍数（由个体属性写入） | 个体属性 |
| `move_time_mult` | 移动一格时间倍数（由个体属性写入） | 个体属性 |
| `fullness_decay_mult` / `hydration_decay_mult` | 饱食/饮水衰减倍数（可选） | 个体属性 |

个体属性修正规则：`*_mult` 对已有数值做乘法（如 `max_weight_mult: 0.8`）；若无对应基础项则写入 state（如 `fatigue_gain_mult`）；`*_mod` 对已有数值做加减（如 `inventory_size_mod: -2`）。

---

## 4. 核心逻辑摘要

- **当前场景**：`Engine.cur`（来自 `scenes[id]` 的深拷贝），玩家格子下标 `Engine.pIdx`。
- **格子**：`grid[i]` 可为空地、出口（`acts` 含 `move`）、`object_id`、`npc_id`；可带 `action_ids` 或内联 `acts`、`onStep`。
- **移动**：点击相邻格或 WASD/方向键；每格耗 10 分钟（腿伤有系数），触发 `advanceTime` 和当前格 `onStep`。
- **时间**：`Engine.advanceTime(mins)` 推进时间，扣饱食/饮水、加疲劳，并推进 buff 的 `on_tick` 与 duration。
- **动作**：`Engine.performAction(actionId, context)` 会推进时间、执行 `action.cmd` 或特殊 effect（睡觉、治疗肢体、打开容器等）。
- **指令**：`Engine.run(cmds)` 支持 `log`、`move`、`advance_time`、`mod_stat`、`hp_limb`、`add_to_inventory`、`remove_from_inventory`（支持 `count`）、`take_item_from_ground`（可选 `item_id` 表示从地上物品栏捡起）、`drop_to_ground`（`item_id`、`count`）、`move_item_to_container`、`move_item_from_container`、`recover_limbs_ratio`、`call_action`、`add_buff`、`remove_buff`、`check_body_text`。指令可带 `condition`（如 `has_buff`/`not_has_buff`）。
- **地上物品**：每格地块有 8 格地面物品栏（`groundInventory`），与地块上的存储容器独立。阻挡格不可放置。篝火格每时间推进会烧毁地上非 `fireproof` 标签物品；每 3 天会随机消失一件非 `indestructible` 标签的地上物品。物品标签见 `objects.json`（如 `fireproof`、`indestructible`）。
- **状态与属性**：`state` 含 饱食/饮水/疲劳（每 10 分钟约 -0.35、-0.35、+0.21）、精力/内力（energy/energy_max, neili/neili_max）、心情(-50~50)、营养(0~100)、六大属性先天/后天（str_innate/str_acq 等）、combat_skill_slots（12 类）。饮水=0 时每 30 分钟脱水 debuff 全体肢 -1。**查看自身**：仅当 `Engine.hasCombatAwareness(state)` 为真（即拥有特殊技能「战斗感知」）时显示完整战斗相关模块（肢体+生存程度等）；否则只显示生存四项，且不展示具体数值。**战斗感知**与第一个战斗技能通过家中「剑谱」阅读事件解锁：执行动作「阅读」后获得战斗感知并学会 基本剑法（等级 1/500、熟练度 0%，仅内部存储，UI 仅用程度描述）。指令：`grant_combat_awareness`、`learn_combat_skill`（`slot`、`skill_id`、`level`、`level_max`、`proficiency`）、`set_combat_skill`（`slot`、`skill_id`）。技能进度存于 `state.combat_skill_progress[skill_id]`。

---

## 5. 扩展指南

- **新场景/新格子/新出口**：改 `data/scenes.json`。
- **新物体/新 NPC**：改 `data/objects.json`、`data/npcs.json`，在场景 `grid` 中引用 `object_id`/`npc_id`。
- **新动作**：在 `data/actions.json` 增加条目，用 `cmd` 或 `effect`；在物体/NPC/格子的 `action_ids` 或 `acts` 中引用。
- **新指令类型**：在对应的 `*-actions.js` 中实现（如背包→inventory-actions，制作→crafting-actions，状态→status-actions，技能→skill-actions，buff→buff-actions），该模块导出对象已在 main 中合并进 `Engine.runHandlers`；仅当新增类型为与 log/move/advance_time/call_action/check_body_text 同级的核心类型时，才在 main 的 run 的 switch 中加 case。
- **新 effect**：在 `action-dispatcher.js` 的 `ActionDispatcher.perform()` 中增加分支（如 `heal_limb`、`open_container`、`bed_sleep`）。
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
