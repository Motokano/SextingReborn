const Engine = {
    db: { config: null, scenes: null, npcs: null, buffs: null, objects: null, actions: null },
    cur: null, curId: null, pIdx: 0, pID: null, flags: {}, npcStates: {},
    time: { month: 2, day: 24, hour: 8, minute: 0 },
    state: {},
    lastDecayDay: 0, // 用于“每三天地上物品消失”的计时（month*31+day）
    dehydrationAccum: 0,
    GROUND_SLOTS: 8,

    async init() {
        const files = ['config', 'scenes', 'npcs', 'buffs', 'objects', 'actions', 'races', 'character_attributes'];
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
            if (Engine.state.combat_skill_slots == null) Engine.state.combat_skill_slots = { "剑法":null,"刀法":null,"暗器":null,"枪法":null,"掌法":null,"拳法":null,"腿法":null,"棍法":null,"指法":null,"身法":null,"内功":null,"招架":null };
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
            Engine.applyCharacterAttributes(Engine.state, playerDef);

            Engine.loadScene(Engine.db.config.startScene, Engine.db.config.startIndex);
            Engine.lastDecayDay = Engine.time.month * 31 + Engine.time.day;
            Engine.setupKeyboardControls();
        } catch (e) { console.error(e); }
    },

    setupKeyboardControls() {
        document.addEventListener('keydown', (e) => {
            // Don't move if a modal is open
            if (document.querySelector('.modal-overlay:not(.hidden)')) {
                return;
            }

            let targetIndex = -1;
            const pIdx = Engine.pIdx;
            const COLS = Engine.cur.cols || 8;

            switch (e.key) {
                case 'w':
                case 'ArrowUp':
                    targetIndex = pIdx - COLS;
                    break;
                case 's':
                case 'ArrowDown':
                    targetIndex = pIdx + COLS;
                    break;
                case 'a':
                case 'ArrowLeft':
                    // Prevent wrapping
                    if (pIdx % COLS === 0) return;
                    targetIndex = pIdx - 1;
                    break;
                case 'd':
                case 'ArrowRight':
                    // Prevent wrapping
                    if (pIdx % COLS === COLS - 1) return;
                    targetIndex = pIdx + 1;
                    break;
                default:
                    return; // Exit if it's not a movement key
            }

            e.preventDefault(); // Prevent scrolling the page

            if (targetIndex >= 0 && targetIndex < Engine.cur.grid.length) {
                Engine.click(targetIndex);
            }
        });
    },

    loadScene(id, entry = null) {
        if (!Engine.db.scenes[id]) return;
        Engine.curId = id;
        Engine.cur = JSON.parse(JSON.stringify(Engine.db.scenes[id]));
        if (entry !== null) Engine.pIdx = entry;
        Engine.render();
        Engine.log(`<b>[环境]</b> 抵达：${Engine.cur.name}`);
    },

    advanceTime(mins) {
        const m = Number(mins) || 0;
        if (m <= 0) return;

        const turnsPassed = Math.floor(m / 10);
        const oldMinute = Engine.time.minute;
        Engine.time.minute += m;
        while (Engine.time.minute >= 60) { Engine.time.minute -= 60; Engine.time.hour++; }
        while (Engine.time.hour >= 24) { Engine.time.hour -= 24; Engine.time.day++; }

        const tenMinSteps = m / 10;
        const fullDecay = (Engine.state.fullness_decay_mult || 1) * 0.35 * tenMinSteps;
        const hydDecay = (Engine.state.hydration_decay_mult || 1) * 0.35 * tenMinSteps;
        const fatigueGain = (Engine.state.fatigue_gain_mult || 1) * 0.21 * tenMinSteps;
        Engine.state.fullness = Math.max(0, Engine.state.fullness - fullDecay);
        Engine.state.hydration = Math.max(0, Engine.state.hydration - hydDecay);
        Engine.state.fatigue = Math.min(100, Engine.state.fatigue + fatigueGain);
        if (Engine.state.hydration <= 0) {
            Engine.dehydrationAccum += m;
            while (Engine.dehydrationAccum >= 30) {
                Engine.dehydrationAccum -= 30;
                const limbs = Engine.state.limbs || {};
                Object.keys(limbs).forEach(limb => {
                    if (limbs[limb] > 0) Engine.state.limbs[limb] = Math.max(0, limbs[limb] - 1);
                });
                Engine.log("脱水令你浑身发虚，伤势加重。");
            }
        } else {
            Engine.dehydrationAccum = 0;
        }

        if (turnsPassed > 0) {
            Engine.runGroundCellEffects();
            Engine.runGroundDecay();
        }
        
        if (turnsPassed > 0) {
            const buffsToRemove = [];
            for (const activeBuff of Engine.state.buffs) {
                const buffDef = Engine.db.buffs.definitions[activeBuff.id];
                if (!buffDef) continue;
                
                if (buffDef.effects?.on_tick) {
                    for (let i = 0; i < turnsPassed; i++) Engine.run(buffDef.effects.on_tick);
                }
                
                if (activeBuff.duration !== -1) {
                    activeBuff.duration -= turnsPassed;
                    if (activeBuff.duration <= 0) buffsToRemove.push(activeBuff.id);
                }
            }
            if (buffsToRemove.length > 0) {
                buffsToRemove.forEach(id => Engine.run([{type: 'remove_buff', id: id}]));
            }
        }
    },

    runGroundCellEffects() {
        Engine.cur.grid.forEach((cell, idx) => {
            if (!cell.groundInventory || Object.keys(cell.groundInventory).length === 0) return;
            const obj = cell.object_id ? Engine.db.objects[cell.object_id] : null;
            if (!obj || cell.object_id !== 'campfire') return;
            const toRemove = [];
            for (const itemId of Object.keys(cell.groundInventory)) {
                const item = (Engine.db.objects && Engine.db.objects[itemId]) || (Engine.db.items && Engine.db.items[itemId]);
                if (!item || (item.tags && item.tags.includes('fireproof'))) continue;
                toRemove.push(itemId);
            }
            toRemove.forEach(itemId => {
                const item = Engine.db.objects[itemId] || Engine.db.items[itemId];
                const n = cell.groundInventory[itemId] || 0;
                delete cell.groundInventory[itemId];
                if (n > 0 && item) Engine.log(`<b>[环境]</b> 篝火将地上的${item.sn}烧毁了。`);
            });
        });
    },

    runGroundDecay() {
        const currentDayNum = Engine.time.month * 31 + Engine.time.day;
        while (currentDayNum >= Engine.lastDecayDay + 3) {
            Engine.lastDecayDay += 3;
            Engine.cur.grid.forEach((cell) => {
                if (!cell.groundInventory || Object.keys(cell.groundInventory).length === 0) return;
                const candidates = [];
                for (const [itemId, count] of Object.entries(cell.groundInventory)) {
                    const item = (Engine.db.objects && Engine.db.objects[itemId]) || (Engine.db.items && Engine.db.items[itemId]);
                    if (item && item.tags && item.tags.includes('indestructible')) continue;
                    for (let i = 0; i < count; i++) candidates.push(itemId);
                }
                if (candidates.length === 0) return;
                const pick = candidates[Math.floor(Math.random() * candidates.length)];
                const item = Engine.db.objects[pick] || Engine.db.items[pick];
                cell.groundInventory[pick] = (cell.groundInventory[pick] || 0) - 1;
                if (cell.groundInventory[pick] <= 0) delete cell.groundInventory[pick];
                if (item) Engine.log(`<b>[环境]</b> 地上的${item.sn}在时光中朽坏了。`);
            });
        }
    },

    render() {
        UI.updateStatus(Engine.time, Engine.cur.name);
        document.getElementById('scene-desc').innerText = Engine.cur.desc;
        const g = document.getElementById('action-grid');
        g.innerHTML = "";
        Engine.cur.grid.forEach((c, i) => {
            const isP = (i === Engine.pIdx);
            const ref = c.object_id ? Engine.db.objects[c.object_id] : (c.npc_id ? Engine.db.npcs[c.npc_id] : null);
            const groundTotal = (c.groundInventory && Object.keys(c.groundInventory).length) ? Object.values(c.groundInventory).reduce((a, n) => a + n, 0) : 0;
            let cellLabel = ref ? ref.sn : (c.sn || "");
            if (groundTotal > 0 && !cellLabel) cellLabel = "物品";
            const btn = document.createElement('div');
            btn.className = `btn ${c.type || (ref?ref.type:'')} ${c.blocking || (ref?ref.blocking:false) ? 'blocking' : ''} ${isP ? 'player-token' : ''}`;
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
        Engine.updateMenus();
    },

    applyCharacterAttributes(state, charDef) {
        const attrs = charDef && charDef.attributes;
        const defs = Engine.db.character_attributes && Engine.db.character_attributes.attribute_definitions;
        if (!attrs || !defs) return;
        for (const [attrKey, valueKey] of Object.entries(attrs)) {
            const attrDef = defs[attrKey];
            if (!attrDef || !attrDef.values || !attrDef.values[valueKey]) continue;
            const mods = attrDef.values[valueKey].modifiers || {};
            for (const [modKey, val] of Object.entries(mods)) {
                if (modKey.endsWith('_mult')) {
                    const baseKey = modKey.slice(0, -5);
                    if (state[baseKey] != null && typeof state[baseKey] === 'number') {
                        state[baseKey] = Math.max(0, Math.floor(state[baseKey] * val));
                    } else {
                        state[modKey] = val;
                    }
                } else if (modKey.endsWith('_mod')) {
                    const baseKey = modKey.slice(0, -4);
                    state[baseKey] = Math.max(0, (state[baseKey] ?? 0) + val);
                }
            }
        }
    },

    getNpcState(npcId) {
        if (!npcId) return null;
        if (Engine.npcStates[npcId]) return Engine.npcStates[npcId];
        const npcDef = Engine.db.npcs[npcId];
        if (!npcDef) return null;
        const race = Engine.db.races.find(r => r.id === npcDef.race);
        if (!race) return null;
        const st = JSON.parse(JSON.stringify(race.base_stats));
        if (!st.buffs) st.buffs = [];
        Engine.applyCharacterAttributes(st, npcDef);
        Engine.npcStates[npcId] = st;
        return st;
    },

    getEffectiveAttr(state, attrKey) {
        const s = state || Engine.state;
        const innate = s[attrKey + '_innate'];
        const acq = s[attrKey + '_acq'];
        return (innate != null ? innate : 10) + (acq != null ? acq : 0);
    },

    hasCombatAwareness(state) {
        const s = state || Engine.state;
        return s.combat_awareness === true;
    },

    hasAnySkillCategoryUnlocked(state) {
        const s = state || Engine.state;
        if (Object.keys(s.survival_skills || {}).length > 0) return true;
        if (Object.keys(s.production_skills || {}).length > 0) return true;
        if (s.combat_awareness === true) return true;
        if (Object.keys(s.support_skills || {}).length > 0) return true;
        return false;
    },

    hasAnyCombatSkill(state) {
        const s = state || Engine.state;
        const slots = s.combat_skill_slots || {};
        return Object.keys(slots).some(k => slots[k] != null && slots[k] !== '');
    },

    getBaseItemId(key) {
        if (!key || typeof key !== 'string') return key;
        const m = key.match(/^(.+)_\d+$/);
        return m ? m[1] : key;
    },

    getNextSlotKey(inventory, baseItemId) {
        if (!inventory[baseItemId]) return baseItemId;
        let n = 1;
        while (inventory[baseItemId + '_' + n]) n++;
        return baseItemId + '_' + n;
    },

    useItem(itemId) {
        const baseId = Engine.getBaseItemId(itemId);
        const item = (Engine.db.objects && Engine.db.objects[baseId]) || (Engine.db.items && Engine.db.items[baseId]);
        if (!item) return;

        const effectId = item.effect_id;
        const effectParams = item.effect_params || {};
        if (!effectId) {
            Engine.log(`你不知道该怎么使用${item.sn}。`);
            return;
        }

        const targetMode = item.use_target || 'self';
        const scope = item.use_scope || 'single_limb';
        const limbFilter = item.use_limb_filter || 'alive_only';

        const applyForTarget = (target) => {
            Engine.applyEffect(effectId, { ...effectParams, scope, limbFilter, itemId }, target);
        };

        if (targetMode === 'self') {
            applyForTarget({ type: 'self' });
        } else {
            const npcsInScene = Array.from(new Set(
                Engine.cur.grid
                    .filter(c => c.npc_id)
                    .map(c => c.npc_id)
            ));
            const options = [];
            if (targetMode === 'self_or_npc') {
                options.push({ key: 'self', text: '自己' });
            }
            npcsInScene.forEach(id => {
                const def = Engine.db.npcs[id];
                if (!def) return;
                options.push({ key: `npc:${id}`, text: def.sn || id });
            });
            if (options.length === 0) {
                Engine.log("这里没有可以使用的目标。");
                return;
            }
            UI.showChoiceModal(`选择使用${item.sn}的目标`, options, key => {
                if (key === 'self') applyForTarget({ type: 'self' });
                else if (key.startsWith('npc:')) applyForTarget({ type: 'npc', id: key.slice(4) });
            });
        }
    },

    applyEffect(effectId, params, target) {
        const itemId = params.itemId;
        const timeCost = Number(params.time_cost) || 0;
        if (timeCost > 0) Engine.advanceTime(timeCost);

        if (effectId === 'heal_limb') {
            const limbMap = { head: "头部", chest: "胸部", stomach: "腹部", l_arm: "左手", r_arm: "右手", l_leg: "左腿", r_leg: "右腿" };
            const healAmount = Number(params.heal) || 0;
            const scope = params.scope || 'single_limb';
            const limbFilter = params.limbFilter || 'alive_only';

            const getState = (t) => {
                if (!t || t.type === 'self') return Engine.state;
                if (t.type === 'npc') return Engine.getNpcState(t.id);
                return Engine.state;
            };
            const st = getState(target);
            if (!st || !st.limbs) {
                Engine.log("目标没有可治疗的部位。");
                return;
            }

            const limbEntries = Object.entries(st.limbs);
            const filterFunc = (k, v) => {
                if (limbFilter === 'alive_only') return v > 0;
                return true;
            };
            const healOne = (limbKey) => {
                const max = st.maxLimbs ? st.maxLimbs[limbKey] : Engine.state.maxLimbs[limbKey];
                if (max == null) return;
                st.limbs[limbKey] = Math.min(max, st.limbs[limbKey] + healAmount);
            };

            if (scope === 'all_limbs') {
                let any = false;
                limbEntries.forEach(([k, v]) => {
                    if (filterFunc(k, v)) {
                        healOne(k);
                        any = true;
                    }
                });
                if (!any) {
                    Engine.log("没有需要治疗的部位。");
                    return;
                }
                Engine.run([{ type: 'remove_from_inventory', item_id: itemId }]);
                Engine.log("你为目标处理了全身的伤势。");
                Engine.render();
                return;
            }

            const healable = limbEntries
                .map(([k, v]) => {
                    const max = st.maxLimbs ? st.maxLimbs[k] : Engine.state.maxLimbs[k];
                    return filterFunc(k, v) && v < max ? { key: k, hp: v, max } : null;
                })
                .filter(Boolean);
            if (healable.length === 0) {
                Engine.log("没有需要治疗的部位。");
                return;
            }
            const options = healable.map(l => ({
                key: l.key,
                text: `${limbMap[l.key] || l.key} (${l.hp.toFixed(0)}/${l.max})`
            }));
            UI.showChoiceModal("选择治疗部位", options, limbKey => {
                healOne(limbKey);
                Engine.run([{ type: 'remove_from_inventory', item_id: itemId }]);
                Engine.log("你为伤口做了包扎。");
                Engine.render();
            });
            return;
        }

        Engine.log("这个效果尚未实现。");
        Engine.render();
    },

    click(i) {
        const c = Engine.cur.grid[i], d = Engine.dist(Engine.pIdx, i);
        if (d === 1) {
            const ref = c.object_id ? Engine.db.objects[c.object_id] : null;
            if (c.blocking || (ref && ref.blocking)) return;
            
            let legMult = 1;
            if (Engine.state.limbs.l_leg <= 0 && Engine.state.limbs.r_leg <= 0) legMult = 3;
            else if (Engine.state.limbs.l_leg <= 0 || Engine.state.limbs.r_leg <= 0) legMult = 2;

            Engine.pIdx = i;
            const moveMult = Engine.state.move_time_mult || 1;
            const timeCost = Math.max(1, Math.floor(10 * legMult * moveMult));
            Engine.advanceTime(timeCost);
            
            const cmds = c.onStep || (ref ? ref.onStep : null);
            if (cmds) Engine.run(cmds);
            Engine.render();
        } else if (d === 0) Engine.render(); 
    },

    updateMenus() {
        UI.renderMenu('self-options', Engine.db.config.sys_actions, "个人指令");
        const c = Engine.cur.grid[Engine.pIdx];
        const ref = c.object_id ? Engine.db.objects[c.object_id] : (c.npc_id ? Engine.db.npcs[c.npc_id] : null);
        
        let actionIds = c.action_ids || (ref ? ref.action_ids : null);
        const inlineActs = c.acts || (ref ? ref.acts : null);
        if (actionIds) {
            const s = Engine.state;
            if (s.combat_awareness && actionIds.includes('read_sword_manual')) actionIds = actionIds.filter(id => id !== 'read_sword_manual');
            if (s.survival_skills && s.survival_skills['breathing'] && actionIds.includes('read_breathing_manual')) actionIds = actionIds.filter(id => id !== 'read_breathing_manual');
            if (s.production_skills && s.production_skills['mining'] && actionIds.includes('read_mining_manual')) actionIds = actionIds.filter(id => id !== 'read_mining_manual');
            if (s.support_skills && s.support_skills['probe'] && actionIds.includes('read_probe_manual')) actionIds = actionIds.filter(id => id !== 'read_probe_manual');
        }

        const ctxSec = document.getElementById('context-section');
        if (actionIds && actionIds.length > 0) {
            ctxSec.classList.remove('hidden');
            UI.renderMenu('context-options', actionIds, c.fn || (ref ? ref.fn : "当前"));
        } else if (inlineActs && inlineActs.length > 0) {
            ctxSec.classList.remove('hidden');
            UI.renderMenu('context-options', inlineActs, c.fn || (ref ? ref.fn : "当前"));
        } else {
            ctxSec.classList.add('hidden');
        }
    },

    showItemActions(itemId) {
        const baseId = Engine.getBaseItemId(itemId);
        const item = (Engine.db.objects && Engine.db.objects[baseId]) || (Engine.db.items && Engine.db.items[baseId]);
        if (!item) return;

        const options = [];
        if (item.effect_id) {
            options.push({ key: 'use', text: '使用' });
        } else if (item.action_ids && item.action_ids.length > 0) {
            item.action_ids.forEach(actionId => {
                const action = Engine.db.actions[actionId];
                if (action && action.label) options.push({ key: actionId, text: action.label });
            });
        }
        options.push({ key: 'drop', text: '丢到地上' });

        UI.showChoiceModal(`选择对 ${item.sn} 的操作`, options, (actionId) => {
            if (actionId === 'drop') {
                Engine.run([{ type: 'drop_to_ground', item_id: itemId, count: 1 }]);
                Engine.render();
                return;
            }
            if (actionId === 'use' && item.effect_id) {
                Engine.useItem(itemId);
                return;
            }
            Engine.performAction(actionId, { itemId: itemId });
        });
    },

    performAction(actionOrId, context = {}) {
        const action = (typeof actionOrId === 'string') ? Engine.db.actions[actionOrId] : actionOrId;
        if (!action) return;

        const actionId = (typeof actionOrId === 'string') ? actionOrId : null;

        // Handle custom effects first
        if (action.effect === 'heal_limb') {
            const limbMap = { head: "头部", chest: "胸部", stomach: "腹部", l_arm: "左手", r_arm: "右手", l_leg: "左腿", r_leg: "右腿" };
            const healableLimbs = Object.keys(Engine.state.limbs).map(key => {
                const limb = Engine.state.limbs[key];
                const max = Engine.state.maxLimbs[key];
                return (limb > 0 && limb < max) ? { key, hp: limb, max: max } : null;
            }).filter(Boolean);
            if (healableLimbs.length === 0) {
                Engine.log("没有需要治疗的部位。");
                return;
            }
            const options = healableLimbs.map(l => ({ key: l.key, text: `${limbMap[l.key]} (${l.hp.toFixed(0)}/${l.max})` }));
            UI.showChoiceModal("选择治疗部位", options, (limbKey) => {
                Engine.advanceTime((action.turn_cost || 0) * 10);
                Engine.applyLimbDamage(limbKey, action.heal_amount || 30);
                Engine.run([{ type: 'remove_from_inventory', item_id: context.itemId, count: 1 }]);
                Engine.log(`你使用了${action.label}，治疗了${limbMap[limbKey]}。`);
                Engine.render();
            });
            return; 
        }

        if (action.effect === 'open_container') {
            const gridCell = Engine.cur.grid[Engine.pIdx];
            const objectRef = gridCell.object_id ? Engine.db.objects[gridCell.object_id] : null;
            if (objectRef && objectRef.tags && objectRef.tags.includes('container')) {
                // The object in db is a template. We need to interact with the instance in the scene grid.
                const containerInstance = gridCell;
                // Ensure the instance has an inventory.
                containerInstance.inventory = containerInstance.inventory || {};
                // Assign a temporary ID for the UI to reference this specific instance.
                containerInstance.id = `grid_${Engine.pIdx}`;
                UI.showStorageModal(containerInstance);
            } else {
                Engine.log("这里没有什么可以打开的容器。");
            }
            return;
        }

        if (actionId === 'bed_sleep') {
            UI.showSleepModal(hours => {
                if (hours <= 0) return;
                const mins = Math.round(hours * 60);
                Engine.log(`<b>你进入了睡眠...</b> 将休息 ${hours} 小时。`);
                Engine.advanceTime(mins);
                const recoveryRatio = (mins / 480) * 0.1;
                Object.keys(Engine.state.limbs).forEach(l => {
                    const m = Engine.state.maxLimbs[l];
                    Engine.state.limbs[l] = Math.min(m, Engine.state.limbs[l] + m * recoveryRatio);
                });
                const fatigueRecovery = (mins / 480) * 50;
                Engine.state.fatigue = Math.max(0, Engine.state.fatigue - fatigueRecovery);
                const energyMax = Engine.state.energy_max || 100;
                Engine.state.energy = Math.min(energyMax, (Engine.state.energy || 0) + Math.floor((mins / 60) * (energyMax * 0.5)));
                Engine.log(`你感觉精神好多了。`);
                Engine.render();
            });
            return;
        }

        // Standard action execution
        if (actionId && action.repeatable === false) Engine.flags[actionId] = true;
        Engine.advanceTime((action.turn_cost || 0) * 10);
        if (action.cmd) Engine.run(action.cmd);
        Engine.render();
    },

    run(cmds) {
        if (!cmds) return;
        cmds.forEach(c => {
            if (!Engine.checkCondition(c.condition)) return;

            switch(c.type) {
                case 'log': Engine.log(c.val); break;
                case 'move': Engine.loadScene(c.target, c.entry); break;
                case 'advance_time': Engine.advanceTime(c.val); break;
                case 'mod_stat': {
                    const key = c.key;
                    let v = (Engine.state[key] || 0) + Number(c.val);
                    if (key === 'mood') v = Math.max(-50, Math.min(50, v));
                    else if (key === 'nutrition') v = Math.max(0, Math.min(100, v));
                    else if (key === 'energy') v = Math.max(0, Math.min(Engine.state.energy_max || 100, v));
                    else v = Math.max(0, Math.min(100, v));
                    Engine.state[key] = v;
                    break;
                }
                case 'hp_limb': Engine.applyLimbDamage(c.limb, Number(c.val)); break;
                case 'take_item_from_ground': {
                    const gridCell = Engine.cur.grid[Engine.pIdx];
                    if (!gridCell) break;
                    if (c.item_id) {
                        const ground = gridCell.groundInventory || {};
                        if (ground[c.item_id] && ground[c.item_id] > 0) {
                            Engine.run([{ type: 'add_to_inventory', item_id: c.item_id, count: 1 }]);
                            ground[c.item_id]--;
                            if (ground[c.item_id] <= 0) delete ground[c.item_id];
                        }
                    } else if (gridCell.object_id) {
                        const oid = gridCell.object_id;
                        Engine.run([{ type: 'add_to_inventory', item_id: oid, count: 1 }]);
                        delete gridCell.object_id;
                        if (!gridCell.groundInventory && !gridCell.npc_id && !gridCell.acts && !gridCell.action_ids && !gridCell.onStep) gridCell.type = 'null';
                    }
                    break;
                }
                case 'drop_to_ground': {
                    const gridCell = Engine.cur.grid[Engine.pIdx];
                    if (!gridCell) break;
                    const ref = gridCell.object_id ? Engine.db.objects[gridCell.object_id] : null;
                    if (gridCell.blocking || (ref && ref.blocking)) {
                        Engine.log("这里无法放置物品。");
                        break;
                    }
                    const count = c.count || 1;
                    const have = Engine.state.inventory[c.item_id];
                    if (!have || have < count) break;
                    const baseId = Engine.getBaseItemId(c.item_id);
                    const ground = gridCell.groundInventory || (gridCell.groundInventory = {});
                    const total = Object.values(ground).reduce((a, n) => a + n, 0);
                    if (total + count > Engine.GROUND_SLOTS) {
                        Engine.log("这块地上已经放不下更多东西了。");
                        break;
                    }
                    Engine.run([{ type: 'remove_from_inventory', item_id: c.item_id, count }]);
                    ground[baseId] = (ground[baseId] || 0) + count;
                    const item = Engine.db.objects[baseId] || Engine.db.items[baseId];
                    if (item) Engine.log(`你把 ${item.sn} 放到了地上。`);
                    break;
                }
                case 'add_to_inventory': {
                    const baseId = Engine.getBaseItemId(c.item_id) || c.item_id;
                    const item = (Engine.db.objects && Engine.db.objects[baseId]) || (Engine.db.items && Engine.db.items[baseId]);
                    if (!item) break;

                    const inv = Engine.state.inventory;
                    const sizeLimit = Engine.state.inventory_size || 12;
                    const hasBackpack = Engine.state.has_backpack === true;

                    if (hasBackpack) {
                        const count = c.count || 1;
                        const weight = (item.weight || 0) * count;
                        if (Engine.state.current_weight + weight > Engine.state.max_weight) {
                            Engine.log("太重了，拿不动。");
                            break;
                        }
                        const stackLimit = item.stack_limit || 1;
                        const currentCount = inv[baseId] || 0;
                        if (currentCount >= stackLimit) {
                            Engine.log(`${item.sn}在你的背包里已经堆叠满了。`);
                            break;
                        }
                        if (Object.keys(inv).length >= sizeLimit && !inv[baseId]) {
                            Engine.log("背包格子已满。");
                            break;
                        }
                        inv[baseId] = currentCount + count;
                        Engine.state.current_weight += weight;
                        Engine.log(`你得到了 ${item.sn} x${count}。`);
                    } else {
                        const toAdd = c.count || 1;
                        const weight = (item.weight || 0) * toAdd;
                        if (Engine.state.current_weight + weight > Engine.state.max_weight) {
                            Engine.log("太重了，拿不动。");
                            break;
                        }
                        for (let i = 0; i < toAdd; i++) {
                            if (Object.keys(inv).length >= sizeLimit) {
                                Engine.log("身上拿不下了。");
                                break;
                            }
                            const slotKey = Engine.getNextSlotKey(inv, baseId);
                            inv[slotKey] = 1;
                            Engine.state.current_weight += (item.weight || 0);
                        }
                        Engine.log(`你得到了 ${item.sn}${toAdd > 1 ? ' x' + toAdd : ''}。`);
                    }
                    break;
                }
                case 'remove_from_inventory': {
                    const toRemove = c.count || 1;
                    const inv = Engine.state.inventory;
                    let currentCount = inv[c.item_id] || 0;
                    if (currentCount <= 0) break;
                    const baseId = Engine.getBaseItemId(c.item_id);
                    const item = (Engine.db.objects && Engine.db.objects[baseId]) || (Engine.db.items && Engine.db.items[baseId]);
                    const actual = Math.min(toRemove, currentCount);
                    currentCount -= actual;
                    if (currentCount <= 0) delete inv[c.item_id];
                    else inv[c.item_id] = currentCount;
                    if (item && item.weight) Engine.state.current_weight = Math.max(0, Engine.state.current_weight - item.weight * actual);
                    break;
                }
                case 'move_item_to_container': {
                    const gridIdx = parseInt(c.container_id.split('_')[1]);
                    if (isNaN(gridIdx)) break;
                    const container = Engine.cur.grid[gridIdx];
                    const baseId = Engine.getBaseItemId(c.item_id);
                    const itemDef = (Engine.db.objects && Engine.db.objects[baseId]) || (Engine.db.items && Engine.db.items[baseId]);
                    if (!container || !itemDef || !Engine.state.inventory[c.item_id]) break;

                    const containerDef = Engine.db.objects[container.object_id];
                    const currentContainerCount = Object.keys(container.inventory).length;
                    if (currentContainerCount >= containerDef.capacity) {
                        Engine.log(`${containerDef.sn}已经满了。`);
                        break;
                    }
                    Engine.run([{ type: 'remove_from_inventory', item_id: c.item_id, count: 1 }]);
                    container.inventory[baseId] = (container.inventory[baseId] || 0) + 1;
                    Engine.log(`你将一个${itemDef.sn}放入了${containerDef.sn}。`);
                    break;
                }
                case 'move_item_from_container': {
                    const gridIdx = parseInt(c.container_id.split('_')[1]);
                    if (isNaN(gridIdx)) break;
                    const container = Engine.cur.grid[gridIdx];
                    const itemDef = (Engine.db.objects && Engine.db.objects[c.item_id]) || (Engine.db.items && Engine.db.items[c.item_id]);

                    if (!container || !itemDef || !container.inventory[c.item_id]) break;

                    // This just moves one item, validation is in add_to_inventory
                    Engine.run([{type: 'add_to_inventory', item_id: c.item_id, count: 1}]);
                    container.inventory[c.item_id]--;
                    if (container.inventory[c.item_id] <= 0) {
                        delete container.inventory[c.item_id];
                    }
                    break;
                }
                case 'recover_limbs_ratio':
                    Object.keys(Engine.state.limbs).forEach(l => {
                        const m = Engine.state.maxLimbs[l];
                        Engine.state.limbs[l] = Math.min(m, Engine.state.limbs[l] + m * Number(c.val));
                    });
                    break;
                case 'call_action':
                    const action = Engine.db.actions[c.id];
                    if (action && action.cmd) Engine.run(action.cmd);
                    break;
                case 'add_buff': {
                    const buffDef = Engine.db.buffs.definitions[c.id];
                    if (!buffDef || !Engine.canApplyBuff(buffDef, Engine.db.npcs[Engine.pID])) break;

                    const existingBuff = Engine.state.buffs.find(b => b.id === c.id);
                    if (existingBuff) {
                        existingBuff.duration = buffDef.duration; // Refresh duration
                    } else {
                        Engine.state.buffs.push({ id: c.id, duration: buffDef.duration });
                        if(buffDef.effects?.on_add) Engine.run(buffDef.effects.on_add);
                    }
                    break;
                }
                case 'remove_buff': {
                    const buffIdx = Engine.state.buffs.findIndex(b => b.id === c.id);
                    if (buffIdx > -1) {
                        const buffDef = Engine.db.buffs.definitions[c.id];
                        Engine.state.buffs.splice(buffIdx, 1);
                        if(buffDef.effects?.on_remove) Engine.run(buffDef.effects.on_remove);
                    }
                    break;
                }
                case 'check_body_text': Engine.log(`<b>[感知]</b> ${Engine.getSensation()}`); break;
                case 'set_combat_skill': {
                    const slots = Engine.state.combat_skill_slots || {};
                    const slotKey = c.slot;
                    if (slotKey && Object.prototype.hasOwnProperty.call(slots, slotKey)) {
                        slots[slotKey] = c.skill_id || null;
                        Engine.state.combat_skill_slots = slots;
                    }
                    break;
                }
                case 'grant_combat_awareness':
                    Engine.state.combat_awareness = true;
                    break;
                case 'learn_combat_skill': {
                    const slotKey = c.slot;
                    const skillId = c.skill_id;
                    const slots = Engine.state.combat_skill_slots || {};
                    const progress = Engine.state.combat_skill_progress || {};
                    if (slotKey && Object.prototype.hasOwnProperty.call(slots, slotKey) && skillId) {
                        const level = Math.max(1, parseInt(c.level, 10) || 1);
                        const levelMax = Math.max(level, parseInt(c.level_max, 10) || 500);
                        const proficiency = Math.max(0, parseFloat(c.proficiency) || 0);
                        slots[slotKey] = skillId;
                        progress[skillId] = { level, level_max: levelMax, proficiency };
                        Engine.state.combat_skill_slots = slots;
                        Engine.state.combat_skill_progress = progress;
                    }
                    break;
                }
                case 'learn_survival_skill': {
                    const skillId = c.skill_id;
                    const skills = Engine.state.survival_skills || {};
                    if (skillId) {
                        const level = Math.max(1, parseInt(c.level, 10) || 1);
                        const levelMax = Math.max(level, parseInt(c.level_max, 10) || 100);
                        const proficiency = Math.max(0, parseFloat(c.proficiency) || 0);
                        skills[skillId] = { level, level_max: levelMax, proficiency };
                        Engine.state.survival_skills = skills;
                    }
                    break;
                }
                case 'learn_production_skill': {
                    const skillId = c.skill_id;
                    const skills = Engine.state.production_skills || {};
                    if (skillId) {
                        const level = Math.max(1, parseInt(c.level, 10) || 1);
                        const levelMax = Math.max(level, parseInt(c.level_max, 10) || 100);
                        const proficiency = Math.max(0, parseFloat(c.proficiency) || 0);
                        skills[skillId] = { level, level_max: levelMax, proficiency };
                        Engine.state.production_skills = skills;
                    }
                    break;
                }
                case 'learn_support_skill': {
                    const skillId = c.skill_id;
                    const skills = Engine.state.support_skills || {};
                    if (skillId) {
                        const level = Math.max(1, parseInt(c.level, 10) || 1);
                        const levelMax = Math.max(level, parseInt(c.level_max, 10) || 100);
                        const proficiency = Math.max(0, parseFloat(c.proficiency) || 0);
                        skills[skillId] = { level, level_max: levelMax, proficiency };
                        Engine.state.support_skills = skills;
                    }
                    break;
                }
            }
        });
    },

    applyLimbDamage(limb, val) {
        if (val < 0) {
            let overflow = Math.abs(val);
            const cur = Engine.state.limbs[limb];
            if (cur > 0) {
                const dmg = Math.min(cur, overflow);
                Engine.state.limbs[limb] -= dmg;
                overflow -= dmg;
            }
            if (overflow > 0) {
                Engine.log(`<span style='color:red'>[溢出] ${limb}已毁，余威冲击全身！</span>`);
                const alive = Object.keys(Engine.state.limbs).filter(k => Engine.state.limbs[k] > 0);
                if (alive.length > 0) {
                    const share = overflow / alive.length;
                    alive.forEach(k => Engine.state.limbs[k] = Math.max(0, Engine.state.limbs[k] - share));
                }
            }
            document.getElementById('game-app').classList.add('damage-flash');
            setTimeout(() => document.getElementById('game-app').classList.remove('damage-flash'), 150);
        } else {
            Engine.state.limbs[limb] = Math.min(Engine.state.maxLimbs[limb], Engine.state.limbs[limb] + val);
        }
    },

    canApplyBuff(buffDef, charDef) {
        if (!buffDef.requirements) return true;
        const charTags = charDef.tags || [];
        
        if (buffDef.requirements.forbidden_tags) {
            if (buffDef.requirements.forbidden_tags.some(tag => charTags.includes(tag))) return false;
        }
        if (buffDef.requirements.required_tags) {
            if (!buffDef.requirements.required_tags.every(tag => charTags.includes(tag))) return false;
        }
        return true;
    },

    checkCondition(condition) {
        if (!condition) return true;
        if (condition.has_buff) {
            if (!Engine.state.buffs.some(b => b.id === condition.has_buff)) return false;
        }
        if (condition.not_has_buff) {
            if (Engine.state.buffs.some(b => b.id === condition.not_has_buff)) return false;
        }
        return true;
    },
    
    dist(a, b) { return Math.abs(Math.floor(a/8)-Math.floor(b/8)) + Math.abs(a%8-b%8); },
    log(txt) {
        const e = document.createElement('div');
        e.className = 'log';
        e.innerHTML = txt;
        
        // Always log to the main window's content div
        const logContent = document.getElementById('log-content');
        if (logContent) {
            logContent.appendChild(e);
            logContent.scrollTop = logContent.scrollHeight;
        }

        // Also log to the popout window if it exists
        if (UI.popoutWindows.log && !UI.popoutWindows.log.closed) {
            const popoutDoc = UI.popoutWindows.log.document;
            const popoutE = popoutDoc.createElement('div');
            popoutE.className = 'log';
            popoutE.innerHTML = txt;
            popoutDoc.body.appendChild(popoutE);
            popoutDoc.body.scrollTop = popoutDoc.body.scrollHeight;
        }
    },
    getSensation() {
        const sArr = Engine.db.buffs.sensations;
        const res = [];
        for (let s of sArr) {
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
                if(bDef) res.push(bDef.desc);
            });
        }
        return res.length > 0 ? res.join(" ") : sArr.find(s => s.condition === "default").text;
    }
};
window.onload = () => Engine.init();