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
                Engine.log(`你使用了${action.label}，治疗了${limbMap[limbKey]}。`);
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
            const oreItemId = action.ore_item_id || 'iron_ore';
            const turnCost = action.turn_cost || 3;
            if (UI.showManualMiningModal) {
                UI.showManualMiningModal({ difficulty, oreItemId, turnCost });
            } else {
                Engine.log("你举起工具，开始挖掘岩壁。");
                Engine.advanceTime(turnCost * 10);
                Engine.run([
                    { type: 'mine_ore', mode: 'manual', difficulty, ore_item_id: oreItemId, cycles: 1 },
                    { type: 'mod_stat', key: 'fatigue', val: 2 }
                ]);
                Engine.render();
            }
            return;
        }

        if (action.effect === 'manual_logging' || actionId === 'chop_manual') {
            const difficulty = action.difficulty || 2;
            const woodItemId = action.wood_item_id || 'rough_log';
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
            const fishItemId = action.fish_item_id || 'river_fish';
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
