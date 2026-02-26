const Engine = {
    db: { config: null, scenes: null, npcs: null, buffs: null, objects: null, actions: null },
    cur: null, curId: null, pIdx: 0, pID: null, flags: {}, npcStates: {},
    time: { month: 2, day: 24, hour: 8, minute: 0 },
    state: {},

    async init() {
        const files = ['config', 'scenes', 'npcs', 'buffs', 'objects', 'actions', 'races'];
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

            Engine.loadScene(Engine.db.config.startScene, Engine.db.config.startIndex);
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

        Engine.state.fullness = Math.max(0, Engine.state.fullness - m/80);
        Engine.state.hydration = Math.max(0, Engine.state.hydration - m/60);
        Engine.state.fatigue = Math.min(100, Engine.state.fatigue + m/120);
        
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

    render() {
        UI.updateStatus(Engine.time, Engine.cur.name);
        document.getElementById('scene-desc').innerText = Engine.cur.desc;
        const g = document.getElementById('action-grid');
        g.innerHTML = "";
        Engine.cur.grid.forEach((c, i) => {
            const isP = (i === Engine.pIdx);
            const ref = c.object_id ? Engine.db.objects[c.object_id] : (c.npc_id ? Engine.db.npcs[c.npc_id] : null);
            const btn = document.createElement('div');
            btn.className = `btn ${c.type || (ref?ref.type:'')} ${c.blocking || (ref?ref.blocking:false) ? 'blocking' : ''} ${isP ? 'player-token' : ''}`;
            btn.innerText = (isP ? "我 " : "") + (ref ? ref.sn : (c.sn || ""));
            btn.onclick = () => Engine.click(i);
            g.appendChild(btn);
        });
        UI.renderStats(Engine.state);
        UI.renderInventory(Engine.state);
        Engine.updateMenus();
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
        Engine.npcStates[npcId] = st;
        return st;
    },

    useItem(itemId) {
        const item = (Engine.db.objects && Engine.db.objects[itemId]) || (Engine.db.items && Engine.db.items[itemId]);
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
            const timeCost = 10 * legMult;
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
        
        const actionIds = c.action_ids || (ref ? ref.action_ids : null);
        const inlineActs = c.acts || (ref ? ref.acts : null);

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
        const item = (Engine.db.objects && Engine.db.objects[itemId]) || (Engine.db.items && Engine.db.items[itemId]);
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
        options.push({ key: 'drop', text: '丢弃' });

        UI.showChoiceModal(`选择对 ${item.sn} 的操作`, options, (actionId) => {
            if (actionId === 'drop') {
                Engine.run([{ type: 'remove_from_inventory', item_id: itemId }]);
                Engine.log(`你丢掉了 ${item.sn}。`);
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
                case 'mod_stat': Engine.state[c.key] = Math.max(0, Math.min(100, Engine.state[c.key] + Number(c.val))); break;
                case 'hp_limb': Engine.applyLimbDamage(c.limb, Number(c.val)); break;
                case 'take_item_from_ground': {
                    const gridCell = Engine.cur.grid[Engine.pIdx];
                    if (gridCell && gridCell.object_id) {
                        Engine.run([{ type: 'add_to_inventory', item_id: gridCell.object_id, count: 1 }]);
                        // We can't just nullify object_id, as it's a reference. 
                        // Instead, we should change the cell to be a plain 'null' type.
                        Object.keys(gridCell).forEach(key => delete gridCell[key]);
                        gridCell.type = 'null';
                    }
                    break;
                }
                case 'add_to_inventory': {
                    const item = (Engine.db.objects && Engine.db.objects[c.item_id]) || (Engine.db.items && Engine.db.items[c.item_id]);
                    if (!item) break;
                    
                    const count = c.count || 1;
                    const weight = (item.weight || 0) * count;

                    if (Engine.state.current_weight + weight > Engine.state.max_weight) {
                        Engine.log("背包太重了，你拿不动更多东西。");
                        break;
                    }

                    const stackLimit = item.stack_limit || 1;
                    const currentCount = Engine.state.inventory[c.item_id] || 0;
                    
                    if (currentCount >= stackLimit) {
                        Engine.log(`${item.sn}在你的背包里已经堆叠满了。`);
                        break;
                    }

                    Engine.state.inventory[c.item_id] = currentCount + count;
                    Engine.state.current_weight += weight;
                    Engine.log(`你得到了 ${item.sn} x${count}。`);
                    break;
                }
                case 'remove_from_inventory': {
                    const currentCount = Engine.state.inventory[c.item_id];
                    if (currentCount && currentCount > 0) {
                        const item = (Engine.db.objects && Engine.db.objects[c.item_id]) || (Engine.db.items && Engine.db.items[c.item_id]);
                        Engine.state.inventory[c.item_id]--;
                        if (Engine.state.inventory[c.item_id] <= 0) {
                            delete Engine.state.inventory[c.item_id];
                        }
                        if (item && item.weight) {
                            Engine.state.current_weight = Math.max(0, Engine.state.current_weight - item.weight);
                        }
                    }
                    break;
                }
                case 'move_item_to_container': {
                    const gridIdx = parseInt(c.container_id.split('_')[1]);
                    if (isNaN(gridIdx)) break;
                    const container = Engine.cur.grid[gridIdx];
                    const itemDef = (Engine.db.objects && Engine.db.objects[c.item_id]) || (Engine.db.items && Engine.db.items[c.item_id]);
                    
                    if (!container || !itemDef || !Engine.state.inventory[c.item_id]) break;

                    const containerDef = Engine.db.objects[container.object_id];
                    const currentContainerCount = Object.keys(container.inventory).length;
                    if (currentContainerCount >= containerDef.capacity) {
                        Engine.log(`${containerDef.sn}已经满了。`);
                        break;
                    }

                    // Move one item
                    Engine.run([{type: 'remove_from_inventory', item_id: c.item_id}]);
                    container.inventory[c.item_id] = (container.inventory[c.item_id] || 0) + 1;
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