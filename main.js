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
        const files = ['config', 'scenes', 'npcs', 'buffs', 'objects', 'actions', 'races', 'character_attributes', 'materials', 'forage', 'recipes'];
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
            CharacterUtils.applyCharacterAttributes(Engine.state, playerDef);

            Movement.loadScene(Engine.db.config.startScene, Engine.db.config.startIndex);
            Engine.lastDecayDay = Engine.time.month * 31 + Engine.time.day;
            Engine.ensureTodayAlmanac();
            Movement.setupKeyboardControls();
        } catch (e) { console.error(e); }
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
                case 'check_body_text': Engine.log(`<b>[感知]</b> ${Engine.getSensation()}`); break;
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
        g.innerHTML = "";
        Engine.cur.grid.forEach((c, i) => {
            const isP = (i === Engine.pIdx);
            const refObj = c.object_id ? Engine.db.objects[c.object_id] : null;
            const groundTotal = (c.groundInventory && Object.keys(c.groundInventory).length) ? Object.values(c.groundInventory).reduce((a, n) => a + n, 0) : 0;
            let cellLabel = refObj ? UI.getObjectDisplayName(refObj, Engine.state) : (c.sn || "");
            if (groundTotal > 0 && !cellLabel) cellLabel = "物品";
            const btn = document.createElement('div');
            btn.className = `btn ${c.type || (refObj ? refObj.type : '')} ${c.blocking || (refObj && refObj.blocking) ? 'blocking' : ''} ${isP ? 'player-token' : ''}`;
            btn.innerText = (isP ? "我 " : "") + cellLabel + (groundTotal > 0 ? ` (${groundTotal})` : "");
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

    // —— 委托：角色/属性
    applyCharacterAttributes(state, charDef) { CharacterUtils.applyCharacterAttributes(state, charDef); },
    getNpcState(npcId) { return CharacterUtils.getNpcState(npcId); },
    getEffectiveAttr(state, attrKey) { return CharacterUtils.getEffectiveAttr(state, attrKey); },

    // —— 委托：技能
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
    typeof BuffActions !== 'undefined' ? BuffActions : {}
);

window.onload = () => Engine.init();
