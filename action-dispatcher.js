/**
 * 玩家动作分发：performAction(actionOrId, context)。处理 heal_limb、open_container、manual_*、bed_sleep 等特例，其余走 cmd。
 * 依赖 Engine, UI。
 */
const ActionDispatcher = {
    perform(actionOrId, context = {}) {
        const action = (typeof actionOrId === 'string') ? Engine.db.actions[actionOrId] : actionOrId;
        if (!action) return;
        const actionId = (typeof actionOrId === 'string') ? actionOrId : null;

        if (actionId === 'fish_auto' && Engine.hasFishingRod && !Engine.hasFishingRod()) {
            Engine.log("需要鱼竿才能钓鱼。");
            Engine.render();
            return;
        }

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
                Engine.log(`你使用了${action.label}，治疗了<span class="log-limb">${limbMap[limbKey]}</span>。`);
                Engine.render();
            });
            return;
        }

        if (action.effect === 'open_container') {
            const gridCell = Engine.cur.grid[Engine.pIdx];
            const objectRef = gridCell.object_id ? Engine.db.objects[gridCell.object_id] : null;
            if (objectRef && objectRef.tags && objectRef.tags.includes('container')) {
                const containerInstance = gridCell;
                containerInstance.inventory = containerInstance.inventory || {};
                containerInstance.id = `grid_${Engine.pIdx}`;
                UI.showStorageModal(containerInstance);
            } else {
                Engine.log("这里没有什么可以打开的容器。");
            }
            return;
        }

        if (action.effect === 'manual_mining' || actionId === 'mine_manual') {
            const difficulty = action.difficulty || 2;
            const cell = Engine.cur && Engine.cur.grid && Engine.cur.grid[Engine.pIdx];
            const objectId = cell && cell.object_id;
            const resolved = Engine.resolveOreSource && Engine.resolveOreSource(Engine.curId, objectId);
            const oreSource = resolved || { ore_item_id: action.ore_item_id || 'iron_ore' };
            const turnCost = action.turn_cost || 3;
            if (UI.showManualMiningModal) {
                UI.showManualMiningModal({ difficulty, turnCost, ore_vein: oreSource.ore_vein, ore_item_id: oreSource.ore_item_id });
            } else {
                Engine.log("你举起工具，开始挖掘岩壁。");
                Engine.advanceTime(turnCost * 10);
                const cmd = { type: 'mine_ore', mode: 'manual', difficulty, cycles: 1 };
                if (oreSource.ore_vein) cmd.ore_vein = oreSource.ore_vein; else cmd.ore_item_id = oreSource.ore_item_id;
                Engine.run([cmd, { type: 'mod_stat', key: 'fatigue', val: 2 }]);
                Engine.render();
            }
            return;
        }

        if (action.effect === 'manual_logging' || actionId === 'chop_manual') {
            const difficulty = action.difficulty || 2;
            const cell = Engine.cur && Engine.cur.grid && Engine.cur.grid[Engine.pIdx];
            const nodeObj = cell && cell.object_id && Engine.db.objects && Engine.db.objects[cell.object_id];
            const woodItemId = (nodeObj && nodeObj.wood_item_id) || action.wood_item_id || 'pine_log';
            const turnCost = action.turn_cost || 3;
            if (UI.showManualLoggingModal) {
                UI.showManualLoggingModal({ difficulty, woodItemId, turnCost });
            } else {
                Engine.log("你握紧斧柄，对准树干挥下。");
                Engine.advanceTime(turnCost * 10);
                Engine.run([
                    { type: 'chop_wood', mode: 'manual', difficulty, wood_item_id: woodItemId, cycles: 1 },
                    { type: 'mod_stat', key: 'fatigue', val: 3 }
                ]);
                Engine.render();
            }
            return;
        }

        if (action.effect === 'manual_fishing' || actionId === 'fish_manual') {
            if (Engine.hasFishingRod && !Engine.hasFishingRod()) {
                Engine.log("需要鱼竿才能钓鱼。");
                Engine.render();
                return;
            }
            const difficulty = action.difficulty || 2;
            const fishItemId = action.fish_item_id || 'dull_bass';
            const turnCost = action.turn_cost || 3;
            if (UI.showManualFishingModal) {
                UI.showManualFishingModal({ difficulty, fishItemId, turnCost });
            } else {
                Engine.log("你选好位置下钩，静候鱼信。");
                Engine.advanceTime(turnCost * 10);
                Engine.run([
                    { type: 'catch_fish', mode: 'manual', difficulty, fish_item_id: fishItemId, cycles: 1 },
                    { type: 'mod_stat', key: 'fatigue', val: 1 }
                ]);
                Engine.render();
            }
            return;
        }

        if (action.effect === 'manual_hunting' || actionId === 'hunt_manual') {
            const difficulty = action.difficulty || 2;
            const turnCost = action.turn_cost || 4;
            if (UI.showManualHuntingModal) {
                UI.showManualHuntingModal({ difficulty, turnCost });
            } else {
                Engine.log("你辨踪潜行，寻找合适的时机下手。");
                Engine.advanceTime(turnCost * 10);
                Engine.run([
                    { type: 'hunt_game', mode: 'manual', difficulty, cycles: 1 },
                    { type: 'mod_stat', key: 'fatigue', val: 2 }
                ]);
                Engine.render();
            }
            return;
        }

        if (action.unlock_building && context.itemId) {
            const buildingId = action.building_id;
            if (buildingId) {
                Engine.run([{ type: 'unlock_building', building_id: buildingId }, { type: 'remove_from_inventory', item_id: context.itemId, count: 1 }]);
                const def = Engine.db.buildings && Engine.db.buildings[buildingId];
                Engine.log("你学会了建造「" + (def && def.sn ? def.sn : buildingId) + "」。");
                Engine.render();
            }
            return;
        }

        if (actionId === 'open_build_menu') {
            if (Engine.curId !== 'home') {
                Engine.log("只有在家中才能建造。");
                Engine.render();
                return;
            }
            if (typeof UI.showBuildModal === 'function') UI.showBuildModal();
            return;
        }

        if (actionId === 'upgrade_building') {
            if (Engine.curId !== 'home' || !Engine.canUpgradeCurrentBuilding || !Engine.canUpgradeCurrentBuilding()) {
                Engine.log("此处无法升级或材料不足。");
                Engine.render();
                return;
            }
            Engine.advanceTime((action.turn_cost || 0) * 10);
            Engine.run([{ type: 'upgrade_building' }]);
            Engine.render();
            return;
        }

        if (actionId === 'rough_process') {
            if (Engine.curId !== 'home' || !Engine.cur || !Engine.cur.grid) {
                Engine.log("只有在家中的生活建筑旁才能粗制加工。");
                Engine.render();
                return;
            }
            const gridCell = Engine.cur.grid[Engine.pIdx];
            const buildingId = gridCell && gridCell.object_id;
            const building = buildingId && Engine.db.buildings && Engine.db.buildings[buildingId];
            const recipes = building && building.process && building.process.length ? building.process : [];
            const options = [];
            recipes.forEach((r, i) => {
                const need = r.input_count || 1;
                const have = typeof Engine.countAvailableMaterial === 'function' ? Engine.countAvailableMaterial(r.input) : 0;
                if (have >= need) {
                    const inName = (typeof UI !== 'undefined' && UI.getItemDisplayName) ? UI.getItemDisplayName(r.input, Engine.state) : ((Engine.db.objects && Engine.db.objects[r.input] && Engine.db.objects[r.input].sn) || r.input);
                    const outName = (typeof UI !== 'undefined' && UI.getItemDisplayName) ? UI.getItemDisplayName(r.output, Engine.state) : ((Engine.db.objects && Engine.db.objects[r.output] && Engine.db.objects[r.output].sn) || r.output);
                    let text = inName + '×' + need + ' → ' + outName + '×' + (r.output_count || 1);
                    if (r.output_special && (typeof UI !== 'undefined' && UI.getItemDisplayName)) {
                        const specialName = UI.getItemDisplayName(r.output_special, Engine.state);
                        text += '（概率获得' + specialName + '）';
                    }
                    options.push({ key: String(i), text });
                }
            });
            if (options.length === 0) {
                Engine.log(recipes.length === 0 ? "这里无法进行粗制加工。" : "材料不足，无法粗制加工。");
                Engine.render();
                return;
            }
            Engine.advanceTime((action.turn_cost || 0) * 10);
            UI.showChoiceModal("粗制加工", options, (key) => {
                Engine.run([{ type: 'process_life_product', building_id: buildingId, recipe_index: parseInt(key, 10) }]);
                Engine.render();
            }, 'list');
            return;
        }

        if (actionId === 'sow_home_crop') {
            const grouped = (typeof Engine.getAvailableSeedsGrouped === 'function') ? Engine.getAvailableSeedsGrouped() : [];
            if (grouped.length === 0) {
                Engine.log("没有可播的种子。");
                Engine.render();
                return;
            }
            Engine.advanceTime((action.turn_cost || 0) * 10);
            const options = grouped.map(g => {
                const key = g.quality === 1 ? g.baseId : g.baseId + '|' + g.quality;
                let name = UI.getItemDisplayName(g.baseId, Engine.state);
                if (g.quality > 1) name = name.replace(/\s*\(品质\d+\)$/, '') + ' (品质' + g.quality + ')';
                const text = g.count > 1 ? name + ' x' + g.count : name;
                return { key, text };
            });
            if (options.length === 1) {
                Engine.run([{ type: 'sow_home_crop', seed_id: options[0].key }]);
            } else {
                UI.showChoiceModal("选择要播的种子", options, (key) => {
                    Engine.run([{ type: 'sow_home_crop', seed_id: key }]);
                    Engine.render();
                }, 'list');
            }
            Engine.render();
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

        if (actionId && action.repeatable === false) Engine.flags[actionId] = true;
        Engine.advanceTime((action.turn_cost || 0) * 10);
        if (action.cmd) Engine.run(action.cmd);
        Engine.render();
    }
};
