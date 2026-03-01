/**
 * main.js：仅作为解释器与入口。定义 Engine、Engine.run()、Engine.init()，所有具体逻辑委托给各模块。
 * 不要在本文件中实现采矿公式、背包逻辑、效果实现等；新增 run 命令请到对应 *-actions.js 并注册到 runHandlers。
 */
const Engine = {
    db: { config: null, scenes: null, npcs: null, buffs: null, objects: null, actions: null, materials: null, forage: null, recipes: null },
    cur: null, curId: null, pIdx: 0, pID: null, flags: {}, npcStates: {},
    time: { month: 2, day: 24, hour: 8, minute: 0 },
    state: {},
    lastDecayDay: 0,
    dehydrationAccum: 0,
    GROUND_SLOTS: 8,

    async init() {
        const files = ['config', 'scenes', 'npcs', 'buffs', 'objects', 'actions', 'races', 'character_attributes', 'materials', 'forage', 'recipes', 'buildings', 'crafting_skills', 'moves', 'internal_arts', 'enemies'];
        try {
            const results = await Promise.all(files.map(async f => {
                const r = await fetch(`./data/${f}.json?v=${Date.now()}`);
                if (!r.ok) throw new Error(`${f}.json缺失`);
                return r.json();
            }));
            files.forEach((f, i) => Engine.db[f] = results[i]);

            Engine.pID = Object.keys(Engine.db.npcs).find(k => Engine.db.npcs[k].is_player);
            if (!Engine.pID) throw new Error("No player character found in npcs.json");

            const playerDef = Engine.db.npcs[Engine.pID];
            const playerRace = Engine.db.races.find(r => r.id === playerDef.race);
            if (!playerRace) throw new Error(`Race '${playerDef.race}' for player not found in races.json`);

            Engine.state = JSON.parse(JSON.stringify(playerRace.base_stats));
            if (!Engine.state.buffs) Engine.state.buffs = [];
            if (Engine.state.combat_skill_slots == null) Engine.state.combat_skill_slots = { "剑法": null, "刀法": null, "暗器": null, "枪法": null, "掌法": null, "拳法": null, "腿法": null, "棍法": null, "指法": null, "身法": null, "内功": null, "招架": null };
            if (Engine.state.combat_awareness == null) Engine.state.combat_awareness = false;
            if (Engine.state.survival_skills == null) Engine.state.survival_skills = {};
            if (Engine.state.production_skills == null) Engine.state.production_skills = {};
            if (Engine.state.support_skills == null) Engine.state.support_skills = {};
            if (Engine.state.combat_skill_progress == null) Engine.state.combat_skill_progress = {};
            if (Engine.state.has_backpack == null) Engine.state.has_backpack = false;
            if (Engine.state.energy == null) Engine.state.energy = 100;
            if (Engine.state.energy_max == null) Engine.state.energy_max = 100;
            if (Engine.state.mood == null) Engine.state.mood = 0;
            if (Engine.state.nutrition == null) Engine.state.nutrition = 100;
            if (Engine.state.neili == null) Engine.state.neili = 0;
            if (Engine.state.neili_max == null) Engine.state.neili_max = 0;
            if (Engine.state.day_index == null) Engine.state.day_index = 1;
            if (Engine.state.todayAlmanac == null) Engine.state.todayAlmanac = null;
            if (Engine.state.has_time_building == null) Engine.state.has_time_building = false;
            if (Engine.state.potential == null) Engine.state.potential = 0;
            if (Engine.state.battle_exp == null) Engine.state.battle_exp = 0;
            if (Engine.state.move_progress == null) Engine.state.move_progress = {};
            if (Engine.state.neili_lower == null) Engine.state.neili_lower = 0;
            if (Engine.state.guard_shield == null) Engine.state.guard_shield = {};
            if (Engine.state.meditating == null) Engine.state.meditating = false;
            if (Engine.state.in_combat == null) Engine.state.in_combat = false;
            if (Engine.state.combat_enemies == null) Engine.state.combat_enemies = [];
            if (Engine.state.combat_queued_command == null) Engine.state.combat_queued_command = null;
            if (Engine.state.combat_escape_pending == null) Engine.state.combat_escape_pending = false;
            if (Engine.state.home_farmland == null) Engine.state.home_farmland = [70, 71, 72, 73];
            if (Engine.state.home_crops == null) Engine.state.home_crops = {};
            if (Engine.state.inventory_quality == null) Engine.state.inventory_quality = {};
            if (Engine.state.inventory_locked == null) Engine.state.inventory_locked = {};
            if (Engine.state.container_locked == null) Engine.state.container_locked = {};
            if (Engine.state.unlocked_buildings == null) Engine.state.unlocked_buildings = {};
            CharacterUtils.applyCharacterAttributes(Engine.state, playerDef);

            Movement.loadScene(Engine.db.config.startScene, Engine.db.config.startIndex);
            Engine.lastDecayDay = Engine.time.month * 31 + Engine.time.day;
            Engine.ensureTodayAlmanac();
            Movement.setupKeyboardControls();
            Engine.startMeditateTick();
        } catch (e) { console.error(e); }
    },

    startMeditateTick() {
        if (Engine._meditateInterval) return;
        Engine._meditateInterval = setInterval(() => {
            const st = Engine.state;
            if (!st || !st.meditating || st.neili_max == null) return;
            st.neili_lower = (st.neili_lower || 0) + 1;
            let max = st.neili_max;
            while (max > 0 && st.neili_lower >= 2 * max) {
                st.neili_lower -= 2 * max;
                st.neili_max = max + 1;
                max = st.neili_max;
            }
        }, 8000);
    },

    run(cmds) {
        if (!cmds) return;
        cmds.forEach(c => {
            if (!Engine.checkCondition(c.condition)) return;
            if (Engine.runHandlers[c.type]) {
                Engine.runHandlers[c.type](c);
                return;
            }
            switch (c.type) {
                case 'log': Engine.log(c.val); break;
                case 'move': Movement.loadScene(c.target, c.entry); break;
                case 'advance_time': Movement.advanceTime(c.val); break;
                case 'call_action': {
                    const action = Engine.db.actions[c.id];
                    if (action && action.cmd) Engine.run(action.cmd);
                    break;
                }
                case 'check_body_text': Engine.log(`<b>[感知]</b> ${Engine.highlightLimbWords(Engine.getFullBodyDescription())}`); break;
                default: break;
            }
        });
    },

    log(txt) {
        const e = document.createElement('div');
        e.className = 'log';
        e.innerHTML = txt;
        const logContent = document.getElementById('log-content');
        if (logContent) {
            logContent.appendChild(e);
            logContent.scrollTop = logContent.scrollHeight;
        }
        if (typeof UI !== 'undefined' && UI.popoutWindows && UI.popoutWindows.log && !UI.popoutWindows.log.closed) {
            const popoutDoc = UI.popoutWindows.log.document;
            const popoutE = popoutDoc.createElement('div');
            popoutE.className = 'log';
            popoutE.innerHTML = txt;
            popoutDoc.body.appendChild(popoutE);
            popoutDoc.body.scrollTop = popoutDoc.body.scrollHeight;
        }
    },

    render() {
        UI.updateStatus(Engine.time, Engine.cur.name);
        document.getElementById('scene-desc').innerText = Engine.cur.desc;
        const g = document.getElementById('action-grid');
        const cols = (Engine.cur && Engine.cur.cols) || 8;
        g.style.gridTemplateColumns = `repeat(${cols}, 64px)`;
        g.innerHTML = "";
        Engine.cur.grid.forEach((c, i) => {
            const isP = (i === Engine.pIdx);
            const refObj = c.object_id ? Engine.db.objects[c.object_id] : null;
            const groundTotal = (c.groundInventory && Object.keys(c.groundInventory).length) ? Object.values(c.groundInventory).reduce((a, n) => a + n, 0) : 0;
            let cellLabel = refObj ? UI.getObjectDisplayName(refObj, Engine.state) : (c.sn || "");
            if (refObj && refObj.tags && refObj.tags.includes('tree')) cellLabel = '树';
            if (Engine.curId === 'home' && c.farmland) {
                const cropInfo = Engine.state.home_crops && Engine.state.home_crops[String(i)];
                if (cropInfo) {
                    const cropObj = Engine.db.objects && Engine.db.objects[cropInfo.crop_id];
                    cellLabel = (cropObj && cropObj.sn) ? cropObj.sn + '田' : '麦田';
                } else cellLabel = '农田';
            }
            if (groundTotal > 0 && !cellLabel) cellLabel = "物品";
            const btn = document.createElement('div');
            btn.className = `btn ${c.type || (refObj ? refObj.type : '')} ${c.blocking || (refObj && refObj.blocking) ? 'blocking' : ''} ${isP ? 'player-token' : ''}`;
            const suffix = (groundTotal > 0 ? ` (${groundTotal})` : "");
            if (isP && cellLabel) {
                btn.innerHTML = "我<br>" + cellLabel.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + suffix;
            } else {
                btn.innerText = (isP ? "我 " : "") + cellLabel + suffix;
            }
            btn.onclick = () => Engine.click(i);
            g.appendChild(btn);
        });
        UI.renderStats(Engine.state);
        UI.renderInventory(Engine.state);
        UI.renderGroundItems(Engine.cur.grid[Engine.pIdx]);
        const anyUnlocked = Engine.hasAnySkillCategoryUnlocked(Engine.state);
        const t1 = document.getElementById('self-actions-title');
        const t2 = document.getElementById('context-options-title');
        if (t1) t1.textContent = anyUnlocked ? '个人动作' : '可做的事';
        if (t2) t2.textContent = anyUnlocked ? '交互选项' : '此处可做';
        MenuController.update();
    },

    checkCondition(condition) {
        if (!condition) return true;
        if (condition.has_buff && !Engine.state.buffs.some(b => b.id === condition.has_buff)) return false;
        if (condition.not_has_buff && Engine.state.buffs.some(b => b.id === condition.not_has_buff)) return false;
        return true;
    },

    getSensation() {
        const sArr = Engine.db.buffs.sensations;
        const res = [];
        for (const s of sArr) {
            if (s.condition === "default") continue;
            let match = false;
            if (s.condition.limb) {
                const r = Engine.state.limbs[s.condition.limb] / Engine.state.maxLimbs[s.condition.limb];
                if (r <= s.condition.ratio) match = true;
            } else if (s.condition.stat) {
                const v = Engine.state[s.condition.stat];
                if (s.condition.op === "lt" && v < s.condition.val) match = true;
            }
            if (match) res.push(s.text);
        }
        if (Engine.state.buffs.length > 0) {
            Engine.state.buffs.forEach(b => {
                const bDef = Engine.db.buffs.definitions[b.id];
                if (bDef) res.push(bDef.desc);
            });
        }
        return res.length > 0 ? res.join(" ") : sArr.find(s => s.condition === "default").text;
    },

    getLimbDegree(cur, max) {
        if (max == null || max <= 0) return "—";
        const r = cur / max;
        if (r >= 1) return "完好";
        if (r >= 0.8) return "轻伤";
        if (r >= 0.5) return "中伤";
        if (r > 0) return "重伤";
        return "损毁";
    },

    getFullBodyDescription() {
        const st = Engine.state;
        const limbNames = { head: "头部", chest: "胸部", stomach: "腹部", l_arm: "左手", r_arm: "右手", l_leg: "左腿", r_leg: "右腿" };
        const parts = [];

        if (st.limbs && st.maxLimbs) {
            const limbLines = [];
            Object.keys(limbNames).forEach(key => {
                if (st.limbs[key] != null && st.maxLimbs[key] != null) {
                    const degree = Engine.getLimbDegree(st.limbs[key], st.maxLimbs[key]);
                    limbLines.push(limbNames[key] + degree);
                }
            });
            if (limbLines.length > 0) parts.push("肢体：" + limbLines.join("、") + "。");
        }

        const full = st.fullness != null ? st.fullness : 100;
        const hyd = st.hydration != null ? st.hydration : 100;
        const energy = st.energy != null ? st.energy : 100;
        const energyMax = st.energy_max != null ? st.energy_max : 100;
        const fatigue = st.fatigue != null ? st.fatigue : 0;
        const degreeFullness = (v) => { if (v >= 80) return "腹中饱满"; if (v >= 60) return "尚可"; if (v >= 40) return "略有饥意"; if (v >= 20) return "饥肠辘辘"; return "腹中空空"; };
        const degreeHydration = (v) => { if (v >= 80) return "口不干"; if (v >= 60) return "尚可"; if (v >= 40) return "略渴"; if (v >= 20) return "口干舌燥"; return "滴水未进"; };
        const degreeEnergy = (v, m) => { const p = m > 0 ? (v / m) * 100 : 0; if (p >= 80) return "精神饱满"; if (p >= 60) return "尚可"; if (p >= 40) return "有些疲惫"; if (p >= 20) return "疲惫不堪"; return "难以为继"; };
        const degreeFatigue = (v) => { if (v <= 20) return "神清气爽"; if (v <= 40) return "尚可"; if (v <= 60) return "有些困倦"; if (v <= 80) return "困顿不堪"; return "难以支撑"; };

        parts.push("饱食 " + degreeFullness(full) + "，饮水 " + degreeHydration(hyd) + "；精力 " + degreeEnergy(energy, energyMax) + "，疲劳 " + degreeFatigue(fatigue) + "。");
        if (st.nutrition != null) {
            const nut = st.nutrition >= 80 ? "充足" : st.nutrition >= 50 ? "尚可" : st.nutrition >= 25 ? "偏亏" : "匮乏";
            parts.push("营养 " + nut + "。");
        }
        if (st.mood != null) {
            const m = st.mood;
            const moodText = m > 20 ? "心情不错" : m > 5 ? "略有好转" : m >= -5 ? "心情平稳" : m > -20 ? "有些低落" : "郁郁寡欢";
            parts.push("心情 " + moodText + "。");
        }
        if (st.neili_max != null && st.neili_max > 0) {
            const cur = st.neili != null ? st.neili : 0;
            const neiliDesc = cur >= st.neili_max * 0.8 ? "内力充盈" : cur >= st.neili_max * 0.4 ? "内力尚可" : cur > 0 ? "内力所剩无几" : "内力已空";
            parts.push(neiliDesc + "。");
        }
        if (st.guard_shield && Object.keys(st.guard_shield).length > 0) {
            const totalShield = Object.values(st.guard_shield).reduce((s, v) => s + (v || 0), 0);
            if (totalShield > 0) parts.push("护体真气尚在，仍可抵挡些许伤害。");
        }

        const sensationText = Engine.getSensation();
        const defaultText = Engine.db.buffs.sensations.find(s => s.condition === "default");
        if (sensationText !== (defaultText && defaultText.text)) parts.push(sensationText);

        return parts.join(" ");
    },

    highlightLimbWords(str) {
        if (typeof str !== 'string') return str;
        const parts = ['左腿', '右腿', '左手', '右手', '头部', '胸部', '腹部', '肢体'];
        let t = str;
        parts.forEach(p => {
            t = t.split(p).join(`<span class="log-limb">${p}</span>`);
        });
        return t;
    },

    // —— 黄历 / 日期
    _dailyRandom(dayIndex, salt) {
        const d = Math.max(1, Number(dayIndex) || 1);
        const s = Number(salt) || 0;
        const x = Math.sin(d * 9301 + s * 49297) * 233280;
        return x - Math.floor(x);
    },

    _buildAlmanacText(modifiers) {
        const nameMap = {
            mining: '挖矿',
            logging: '砍柴',
            fishing: '钓鱼',
            farming: '农事',
            hunting: '打猎'
        };
        const good = [];
        const bad = [];
        Object.keys(modifiers).forEach(k => {
            const v = modifiers[k] || 0;
            if (v > 0.01) good.push(nameMap[k] || k);
            else if (v < -0.01) bad.push(nameMap[k] || k);
        });
        const goodStr = good.length ? `宜${good.join('、')}` : '';
        const badStr = bad.length ? `忌${bad.join('、')}` : '';
        if (!goodStr && !badStr) return '平平无奇的一天，做什么都顺其自然。';
        if (goodStr && badStr) return `${goodStr}，${badStr}。`;
        return `${goodStr || badStr}。`;
    },

    ensureTodayAlmanac() {
        if (!Engine.state) return;
        const dayIndex = Engine.state.day_index || 1;
        const current = Engine.state.todayAlmanac;
        if (current && current.day_index_for === dayIndex && current.modifiers) return;
        const keys = ['mining', 'logging', 'fishing', 'farming', 'hunting'];
        const modifiers = {};
        keys.forEach((k, idx) => {
            const r = Engine._dailyRandom(dayIndex, idx + 1);
            // -0.10 到 +0.10 之间
            const v = (r - 0.5) * 0.2;
            modifiers[k] = v;
        });
        const text = Engine._buildAlmanacText(modifiers);
        Engine.state.todayAlmanac = {
            day_index_for: dayIndex,
            modifiers,
            text
        };
    },

    getAlmanacModifier(activityKey) {
        if (!Engine.state) return 0;
        const dayIndex = Engine.state.day_index || 1;
        if (!Engine.state.todayAlmanac || Engine.state.todayAlmanac.day_index_for !== dayIndex) {
            Engine.ensureTodayAlmanac();
        }
        const almanac = Engine.state.todayAlmanac || {};
        const mods = almanac.modifiers || (almanac.modifiers = {});
        if (!Object.prototype.hasOwnProperty.call(mods, activityKey) && activityKey) {
            // 为新活动懒生成当日加成，使用 activityKey 的简单 hash 作为盐，保证同一天内稳定。
            let hash = 0;
            for (let i = 0; i < activityKey.length; i++) {
                hash = (hash * 31 + activityKey.charCodeAt(i)) & 0x7fffffff;
            }
            const r = Engine._dailyRandom(dayIndex, hash || 1);
            const v = (r - 0.5) * 0.2;
            mods[activityKey] = v;
            Engine.state.todayAlmanac.text = Engine._buildAlmanacText(mods);
        }
        return mods[activityKey] || 0;
    },

    // —— 委托：背包/物品
    getBaseItemId(key) { return InventoryUtils.getBaseItemId(key); },
    getNextSlotKey(inv, baseId) { return InventoryUtils.getNextSlotKey(inv, baseId); },
    countItemInInventory(baseItemId) { return InventoryUtils.countItemInInventory(baseItemId, Engine.state.inventory); },
    findSlotKeyFor(baseItemId) { return InventoryUtils.findSlotKeyFor(baseItemId, Engine.state.inventory); },
    getHomeStorage() {
        if (Engine.curId !== 'home' || !Engine.cur || !Engine.cur.grid) return null;
        for (let i = 0; i < Engine.cur.grid.length; i++) {
            const c = Engine.cur.grid[i];
            if (c && c.object_id === 'storage_box') {
                c.id = c.id || ('grid_' + i);
                c.inventory = c.inventory || {};
                return c;
            }
        }
        return null;
    },
    hasHomeBuilding(objectId) {
        if (Engine.curId !== 'home' || !Engine.cur || !Engine.cur.grid) return false;
        return Engine.cur.grid.some(c => c && c.object_id === objectId);
    },
    getLifeBuildingBonus(skillCategory, skillId) {
        const buildings = Engine.db.buildings || {};
        let best = null;
        for (const bid of Object.keys(buildings)) {
            const b = buildings[bid];
            if (b.skill_category !== skillCategory || b.skill_id !== skillId) continue;
            if (!Engine.hasHomeBuilding(b.object_id)) continue;
            if (!best || (b.level || 0) > (best.level || 0))
                best = b;
        }
        if (!best) return null;
        return { yieldMult: best.yield_bonus || 1, expMult: best.exp_bonus || 1 };
    },
    canUpgradeCurrentBuilding() {
        if (Engine.curId !== 'home' || !Engine.cur || !Engine.cur.grid) return false;
        const cell = Engine.cur.grid[Engine.pIdx];
        const oid = cell && cell.object_id;
        const building = oid && Engine.db.buildings && Engine.db.buildings[oid];
        if (!building || !building.upgrade_to || !building.upgrade_materials) return false;
        for (const [matId, need] of Object.entries(building.upgrade_materials)) {
            const have = Engine.countAvailableMaterial ? Engine.countAvailableMaterial(matId) : 0;
            if (have < need) return false;
        }
        return true;
    },
    countAvailableMaterial(baseItemId) {
        const inv = Engine.state.inventory || {};
        const locked = Engine.state.inventory_locked || {};
        let n = InventoryUtils.countItemInInventoryUnlocked(baseItemId, inv, locked);
        const home = Engine.getHomeStorage && Engine.getHomeStorage();
        if (home && home.inventory) {
            const cLocked = (Engine.state.container_locked || {})[home.id] || {};
            n += InventoryUtils.countItemInInventoryUnlocked(baseItemId, home.inventory, cLocked);
        }
        return n;
    },

    /** 返回所有带指定 tag 的物品 baseId 列表（来自 objects） */
    getItemIdsWithTag(tag) {
        const objs = Engine.db.objects || {};
        return Object.keys(objs).filter(id => objs[id] && objs[id].tags && Array.isArray(objs[id].tags) && objs[id].tags.includes(tag));
    },

    /** 统计背包+仓库中带指定 tag 且未锁定的物品总数量 */
    countAvailableByTag(tag) {
        const ids = Engine.getItemIdsWithTag(tag);
        let total = 0;
        ids.forEach(id => { total += (Engine.countAvailableMaterial && Engine.countAvailableMaterial(id)) || 0; });
        return total;
    },

    getAvailableSeedsGrouped() {
        const objs = Engine.db.objects || {};
        const seedIds = Object.keys(objs).filter(id => objs[id] && objs[id].tags && objs[id].tags.includes('seed'));
        const map = {};
        const inv = Engine.state.inventory || {};
        const locked = Engine.state.inventory_locked || {};
        const invQ = Engine.state.inventory_quality || {};
        seedIds.forEach(baseId => {
            for (const key of Object.keys(inv)) {
                if (locked[key]) continue;
                if (InventoryUtils.getBaseItemId(key) !== baseId) continue;
                const q = InventoryUtils.clampQuality(invQ[key] != null ? invQ[key] : 1);
                const c = (inv[key] || 0) || 1;
                const k = baseId + '|' + q;
                if (!map[k]) map[k] = { baseId, quality: q, count: 0 };
                map[k].count += c;
            }
        });
        const home = Engine.getHomeStorage && Engine.getHomeStorage();
        if (home && home.inventory) {
            const cLocked = (Engine.state.container_locked || {})[home.id] || {};
            seedIds.forEach(baseId => {
                for (const key of Object.keys(home.inventory)) {
                    if (cLocked[key]) continue;
                    if (InventoryUtils.getBaseItemId(key) !== baseId) continue;
                    const c = (home.inventory[key] || 0) || 1;
                    const k = baseId + '|1';
                    if (!map[k]) map[k] = { baseId, quality: 1, count: 0 };
                    map[k].count += c;
                }
            });
        }
        return Object.values(map).filter(g => g.count > 0);
    },

    // —— 委托：角色/属性
    applyCharacterAttributes(state, charDef) { CharacterUtils.applyCharacterAttributes(state, charDef); },
    getNpcState(npcId) { return CharacterUtils.getNpcState(npcId); },
    getEffectiveAttr(state, attrKey) { return CharacterUtils.getEffectiveAttr(state, attrKey); },

    // —— 矿脉/矿石来源：按场景与节点解析，供挖矿使用
    resolveOreSource(sceneId, objectId) {
        const scene = Engine.db.scenes && Engine.db.scenes[sceneId];
        const obj = objectId && Engine.db.objects && Engine.db.objects[objectId];
        if (obj && obj.ore_vein && Object.keys(obj.ore_vein).length > 0) return { ore_vein: obj.ore_vein };
        if (obj && obj.ore_item_id) return { ore_item_id: obj.ore_item_id };
        if (scene && scene.ore_vein && Object.keys(scene.ore_vein).length > 0) return { ore_vein: scene.ore_vein };
        return { ore_item_id: 'iron_ore' };
    },

    // —— 委托：技能与战斗公式
    getMoveLevelCap(battleExp) { return typeof CombatActions !== 'undefined' && CombatActions.getMoveLevelCap ? CombatActions.getMoveLevelCap(battleExp) : 1000; },
    getEffectiveAcq(acq, battleExp) { return typeof CombatActions !== 'undefined' && CombatActions.getEffectiveAcq ? CombatActions.getEffectiveAcq(acq, battleExp) : (Number(acq) || 0); },
    getSkillProgress(category, skillId) { return SkillUtils.getSkillProgress(Engine.state, category, skillId); },
    getMiningBand(level) { return SkillUtils.getMiningBand(level); },
    hasFishingRod() { return SkillUtils.hasFishingRod(Engine.state); },
    hasCombatAwareness(state) { return SkillUtils.hasCombatAwareness(state || Engine.state); },
    hasAnySkillCategoryUnlocked(state) { return SkillUtils.hasAnySkillCategoryUnlocked(state || Engine.state); },
    hasAnyCombatSkill(state) { return SkillUtils.hasAnyCombatSkill(state || Engine.state); },

    // —— 委托：认知 / 效果 / Buff / 移动 / 菜单 / 物品操作 / 动作
    describeTile(cell, ref) { if (typeof Cognition !== 'undefined' && Cognition.describeTile) Cognition.describeTile(cell, ref); },
    applyEffect(effectId, params, target) { Effects.apply(effectId, params, target); },
    applyLimbDamage(limb, val) { Effects.applyLimbDamage(limb, val); },
    canApplyBuff(buffDef, charDef) { return BuffActions.canApplyBuff(buffDef, charDef); },
    advanceTime(mins) { Movement.advanceTime(mins); },
    runGroundCellEffects() { Movement.runGroundCellEffects(); },
    runGroundDecay() { Movement.runGroundDecay(); },
    loadScene(id, entry) { Movement.loadScene(id, entry); },
    setupKeyboardControls() { Movement.setupKeyboardControls(); },
    click(i) { Movement.click(i); },
    dist(a, b) { return Movement.dist(a, b); },
    updateMenus() { MenuController.update(); },
    showItemActions(itemId) { ItemController.showItemActions(itemId); },
    useItem(itemId) { ItemController.useItem(itemId); },
    performAction(actionOrId, context) { ActionDispatcher.perform(actionOrId, context); }
};

Engine.runHandlers = Object.assign(
    {},
    typeof GameActions !== 'undefined' ? GameActions : {},
    typeof InventoryActions !== 'undefined' ? InventoryActions : {},
    typeof CraftingActions !== 'undefined' ? CraftingActions : {},
    typeof StatusActions !== 'undefined' ? StatusActions : {},
    typeof SkillActions !== 'undefined' ? SkillActions : {},
    typeof BuffActions !== 'undefined' ? BuffActions : {},
    typeof LanguageActions !== 'undefined' ? LanguageActions : {},
    typeof CombatRunHandlers !== 'undefined' ? CombatRunHandlers : {}
);

window.onload = () => Engine.init();
