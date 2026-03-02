/**
 * 战斗流程：进入/结束战斗、3 秒回合、出手顺序、命中/格挡/伤害、逃跑判定。
 * 依赖 Engine, CombatActions, Effects。
 */
const LIMB_NAMES_COMBAT = { head: "头部", chest: "胸部", stomach: "腹部", l_arm: "左手", r_arm: "右手", l_leg: "左腿", r_leg: "右腿" };

const CombatEngine = {
    ROUND_MS: 3000,
    _intervalId: null,

    logCombat(html) {
        if (typeof UI !== 'undefined' && UI.appendCombatLog) UI.appendCombatLog(html);
        else if (typeof Engine !== 'undefined' && Engine.log) Engine.log(html);
    },

    getDefaultMoveId(state) {
        const moves = Engine.db.moves || {};
        const progress = state.move_progress || {};
        // Prefer per-limb attack slot for dominant hand
        const dominantHand = state.dominant_hand || 'right';
        const dominantLimb = dominantHand === 'left' ? 'l_arm' : 'r_arm';
        const byLimb = state.combat_skill_slots_by_limb || {};
        const limbAttack = byLimb[dominantLimb] && byLimb[dominantLimb].attack;
        if (limbAttack && moves[limbAttack]) return limbAttack;
        // Fall back to global 剑法 slot, then any learned move
        const slotSword = state.combat_skill_slots && state.combat_skill_slots['剑法'];
        if (slotSword && moves[slotSword] && (moves[slotSword].slot === '剑法')) {
            const prog = progress[slotSword];
            if (prog && (prog.level || 0) >= 1) return slotSword;
        }
        for (const moveId of Object.keys(moves)) {
            const prog = progress[moveId];
            if (prog && (prog.level || 0) >= 1) return moveId;
        }
        return moves.basic_sword_thrust ? 'basic_sword_thrust' : null;
    },

    getCombatState() {
        const st = Engine.state;
        return {
            in_combat: !!st.in_combat,
            enemies: (st.combat_enemies || []).slice(),
            queued: st.combat_queued_command || null,
            escape_pending: !!st.combat_escape_pending
        };
    },

    startCombat(enemyIds) {
        const db = Engine.db.enemies || {};
        const list = [];
        (enemyIds || []).forEach(id => {
            const def = db[id];
            if (!def) return;
            const state = {
                limbs: JSON.parse(JSON.stringify(def.limbs || {})),
                maxLimbs: JSON.parse(JSON.stringify(def.maxLimbs || def.limbs || {})),
                reflex_innate: def.reflex_innate || 10,
                reflex_acq: def.reflex_acq || 0,
                sinew_innate: def.sinew_innate || 10,
                flex_innate: def.flex_innate || 10,
                combat_skill_progress: def.combat_skill_progress ? JSON.parse(JSON.stringify(def.combat_skill_progress)) : {}
            };
            list.push({ id: def.id, sn: def.sn || id, def, state });
        });
        if (list.length === 0) return;
        Engine.state.in_combat = true;
        Engine.state.combat_enemies = list;
        Engine.state.combat_queued_command = null;
        Engine.state.combat_escape_pending = false;
        if (typeof UI !== 'undefined' && UI.showCombatModal) UI.showCombatModal();
        CombatEngine.logCombat("<span class='log-combat'>进入战斗！</span>");
        if (typeof UI !== 'undefined' && UI.updateCombatPanel) UI.updateCombatPanel();
        CombatEngine.startRoundTimer();
    },

    endCombat(result) {
        const st = Engine.state;
        st.in_combat = false;
        const enemies = st.combat_enemies || [];
        st.combat_enemies = [];
        st.combat_queued_command = null;
        st.combat_escape_pending = false;
        CombatEngine.stopRoundTimer();
        if (result === 'win') {
            CombatEngine.logCombat("<span class='log-combat'>战斗胜利。</span>");
            enemies.forEach(e => {
                const gain = e.def.potential_gain;
                const exp = e.def.battle_exp_gain;
                if (gain && Engine.runHandlers.mod_potential) Engine.runHandlers.mod_potential({ val: gain });
                if (exp && Engine.runHandlers.mod_battle_exp) Engine.runHandlers.mod_battle_exp({ val: exp });
                const drops = e.def.drops || {};
                Object.entries(drops).forEach(([itemId, count]) => {
                    if (Engine.runHandlers.add_to_inventory) Engine.runHandlers.add_to_inventory({ item_id: itemId, count: count || 1 });
                });
            });
        } else if (result === 'lose') {
            CombatEngine.logCombat("<span class='log-combat'>你已败北，伤势沉重。</span>");
        } else if (result === 'flee') {
            CombatEngine.logCombat("<span class='log-combat'>你脱身而退。</span>");
        }
        // 地牢内战斗结束后的额外处理（如普通敌人房逃跑重生/击杀清除）
        if (Engine.state.dungeon && Engine.state.dungeon.active && typeof DungeonManager !== 'undefined' && typeof DungeonManager.onCombatEndInDungeon === 'function') {
            DungeonManager.onCombatEndInDungeon(result);
        }
        if (typeof UI !== 'undefined' && UI.updateCombatPanel) UI.updateCombatPanel();
        if (typeof UI !== 'undefined' && UI.closeCombatModal) UI.closeCombatModal();
        if (typeof Engine.render === 'function') Engine.render();
        if (result === 'win' && Engine.state.dungeon && Engine.state.dungeon.active && typeof DungeonUI !== 'undefined' && DungeonUI.onCombatEnd) DungeonUI.onCombatEnd();
    },

    startRoundTimer() {
        CombatEngine.stopRoundTimer();
        CombatEngine._intervalId = setInterval(() => {
            if (!Engine.state.in_combat) return;
            CombatEngine.runRound();
        }, CombatEngine.ROUND_MS);
    },

    stopRoundTimer() {
        if (CombatEngine._intervalId) {
            clearInterval(CombatEngine._intervalId);
            CombatEngine._intervalId = null;
        }
    },

    queueCommand(cmd) {
        Engine.state.combat_queued_command = cmd;
        if (typeof UI !== 'undefined' && UI.updateCombatPanel) UI.updateCombatPanel();
    },

    runRound() {
        const st = Engine.state;
        if (!st.in_combat || !st.combat_enemies || st.combat_enemies.length === 0) {
            CombatEngine.endCombat('win');
            return;
        }

        const player = { actor: 'player', state: st, speed: CombatActions.getSpeed(st) };
        const enemyActors = (st.combat_enemies || []).map((e, i) => ({
            actor: 'enemy', index: i, sn: e.sn, state: e.state, def: e.def,
            speed: CombatActions.getSpeed(e.state)
        }));
        const order = [player, ...enemyActors].sort((a, b) => (b.speed || 0) - (a.speed || 0));

        for (const entry of order) {
            if (!st.in_combat) break;
            if (entry.actor === 'player') {
                const cmd = st.combat_queued_command;
                st.combat_queued_command = null;
                if (cmd && cmd.type === 'flee') {
                    st.combat_escape_pending = true;
                    CombatEngine.logCombat("<span class='log-combat'>你试图脱身...</span>");
                } else if (cmd && cmd.type === 'item') {
                    CombatEngine.logCombat("<span class='log-combat'>你使用了道具。</span>");
                    if (cmd.item_id && Engine.runHandlers.remove_from_inventory) Engine.runHandlers.remove_from_inventory({ item_id: cmd.item_id, count: 1 });
                    if (cmd.effect === 'heal_limb' && cmd.heal_amount) {
                        const limbs = Object.keys(st.limbs || {});
                        const pick = limbs[Math.floor(Math.random() * limbs.length)];
                        if (pick && st.maxLimbs) st.limbs[pick] = Math.min(st.maxLimbs[pick], (st.limbs[pick] || 0) + (cmd.heal_amount || 0));
                    }
                } else {
                    const alive = st.combat_enemies.filter(e => !CombatActions.isTargetDead(e.state));
                    const target = alive.length ? alive[(cmd && cmd.target_index != null) ? cmd.target_index % alive.length : 0] : null;
                    const moveId = (cmd && cmd.type === 'attack' && cmd.move_id) ? cmd.move_id : CombatEngine.getDefaultMoveId(st);
                    if (st.combat_awareness && target && moveId) {
                        CombatEngine.resolvePlayerAttack(target, moveId);
                    } else if (!st.combat_awareness) {
                        CombatEngine.logCombat("<span class='log-combat'>你无法捕捉到出手的时机，只能设法脱身或使用道具。</span>");
                    } else if (target && moveId) {
                        CombatEngine.resolvePlayerAttack(target, moveId);
                    }
                }
            } else {
                const alive = st.combat_enemies.filter(e => !CombatActions.isTargetDead(e.state));
                if (alive.length === 0) break;
                const me = entry;
                const targetState = st;
                const moveId = me.def.move_id || 'basic_sword_thrust';
                const moves = Engine.db.moves || {};
                const moveDef = moves[moveId] || {};
                const hitRate = CombatActions.getHitRate(me.state, targetState);
                if (Math.random() >= hitRate) {
                    CombatEngine.logCombat("<span class='log-combat'>" + me.sn + " 的攻势落空。</span>");
                    continue;
                }
                const parryChance = CombatActions.getParryChance(targetState);
                if (Math.random() < parryChance) {
                    CombatEngine.logCombat("<span class='log-combat'>你格挡了 " + me.sn + " 的攻击。</span>");
                    continue;
                }
                const limb = CombatActions.pickLimbByWeights(moveDef.limb_weights) || 'chest';
                const raw = (me.def.power_base || 10) * (moveDef.power_coef || 1);
                const crit = (targetState.luck === -1) ? false : (Math.random() < 0.1);
                const finalRaw = raw * (crit ? 1.5 : 1);
                CombatActions.applyDamageWithResistance(limb, finalRaw, moveDef.damage_type || 'blunt');
                const limbName = LIMB_NAMES_COMBAT[limb] || limb;
                CombatEngine.logCombat("<span class='log-combat'>" + me.sn + " 击中了你的<span class='log-limb'>" + limbName + "</span>" + (crit ? "（暴击）" : "") + "。</span>");
            }
        }

        if (st.combat_escape_pending) {
            const playerSpeed = CombatActions.getSpeed(st);
            const maxEnemySpeed = Math.max(0, ...(st.combat_enemies || []).map(e => CombatActions.getSpeed(e.state)));
            const escapeRate = 0.3 + 0.4 * (playerSpeed / (playerSpeed + maxEnemySpeed + 1));
            if (Math.random() < escapeRate) {
                CombatEngine.endCombat('flee');
                return;
            }
            st.combat_escape_pending = false;
            CombatEngine.logCombat("<span class='log-combat'>未能脱身！</span>");
        }

        if (CombatActions.isTargetDead(st)) {
            CombatEngine.endCombat('lose');
            if (typeof Engine.run === 'function') Engine.run([{ type: 'trigger_death' }]);
            return;
        }

        const aliveEnemies = (st.combat_enemies || []).filter(e => !CombatActions.isTargetDead(e.state));
        if (aliveEnemies.length === 0) {
            CombatEngine.endCombat('win');
            return;
        }
        Engine.state.combat_enemies = aliveEnemies.length === st.combat_enemies.length ? st.combat_enemies : aliveEnemies;
        if (typeof UI !== 'undefined' && UI.updateCombatPanel) UI.updateCombatPanel();
    },

    resolvePlayerAttack(targetEnemy, moveId) {
        const st = Engine.state;
        const moves = Engine.db.moves || {};
        const moveDef = moves[moveId] || {};
        if (typeof CombatActions.addMoveUseCount === 'function') CombatActions.addMoveUseCount(moveId);
        const hitRate = CombatActions.getHitRate(st, targetEnemy.state);
        if (Math.random() >= hitRate) {
            CombatEngine.logCombat("<span class='log-combat'>你的攻击落空。</span>");
            return;
        }
        const parryChance = CombatActions.getParryChance(targetEnemy.state);
        if (Math.random() < parryChance) {
            CombatEngine.logCombat("<span class='log-combat'>" + targetEnemy.sn + " 格挡了你的攻击。</span>");
            return;
        }
        const limb = CombatActions.pickLimbByWeights(moveDef.limb_weights) || 'chest';
        const str = (st.str_innate || 0) + (st.str_acq || 0);
        const moveProg = (st.move_progress && st.move_progress[moveId]) || {};
        const lv = moveProg.level || 1;
        const levelMax = moveProg.level_max != null ? moveProg.level_max : (moveDef.level_max != null ? moveDef.level_max : 1000);
        const baseAttack = (str + 5) * (1 + lv * 0.01);
        const equipmentMult = (st.equipment_damage_mult != null) ? Number(st.equipment_damage_mult) : 1;
        const neiliCheng = Number(moveDef.power_coef) || 1;
        const arts = (Engine.db && Engine.db.internal_arts) ? Engine.db.internal_arts : {};
        const neigongId = (st.combat_skill_slots && st.combat_skill_slots['内功']) || 'basic_internal';
        const neigongDef = arts[neigongId] || {};
        const neigongPower = Number(neigongDef.power) || 0;
        const rawMovePower = Number(moveDef.power) || 0;
        const powerLevelFactor = (typeof CombatActions.getMovePowerLevelFactor === 'function') ? CombatActions.getMovePowerLevelFactor(lv, levelMax) : 1;
        const proficiencyPct = (typeof CombatActions.getMoveProficiencyPct === 'function') ? CombatActions.getMoveProficiencyPct(moveId, st, moveDef) : 0;
        const profBonus = 1 + proficiencyPct;
        const movePower = rawMovePower * powerLevelFactor * profBonus;
        const philosophyMult = (typeof CombatActions.getPhilosophyDamageMult === 'function') ? CombatActions.getPhilosophyDamageMult(neigongDef) : 1;
        const powerTerm = movePower + neigongPower * philosophyMult * profBonus;
        const envMult = (typeof CombatActions.getEnvironmentMult === 'function') ? CombatActions.getEnvironmentMult(st, moveId, moveDef) : 1;
        const battleExpMult = (typeof CombatActions.getBattleExpDamageMult === 'function') ? CombatActions.getBattleExpDamageMult(st) : 1;
        const raw = (baseAttack * equipmentMult) * neiliCheng * (1 + powerTerm / 100) * envMult * battleExpMult;
        const crit = (st.luck === -1) ? false : (Math.random() < 0.1);
        const finalRaw = raw * (crit ? 1.5 : 1);
        CombatActions.applyDamageToState(targetEnemy.state, limb, finalRaw, moveDef.damage_type || 'blunt');
        const limbName = LIMB_NAMES_COMBAT[limb] || limb;
        CombatEngine.logCombat("<span class='log-combat'>你击中了 " + targetEnemy.sn + " 的<span class='log-limb'>" + limbName + "</span>" + (crit ? "（暴击）" : "") + "。</span>");
        if (CombatActions.isTargetDead(targetEnemy.state)) {
            CombatEngine.logCombat("<span class='log-combat'>" + targetEnemy.sn + " 已无力再战。</span>");
        }
    }
};
