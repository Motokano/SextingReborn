/**
 * 战斗相关 run 命令与公式：三种伤害类型、按部位抗性、速度/命中/格挡、护体盾值。
 * 依赖 Engine。设计见计划：刺穿/劈砍/钝击、抗性乘算、默认上限 70%、绝对 90%。
 */
const DAMAGE_TYPES = { piercing: '刺穿', slashing: '劈砍', blunt: '钝击' };
const RESIST_CAP_DEFAULT = 0.7;
const RESIST_CAP_ABSOLUTE = 0.9;
/** 默认 5 万次使用满 100% 熟练（每次使用 +0.002%） */
const DEFAULT_USES_PER_FULL_PROFICIENCY = 50000;

const CombatActions = {
    /** 根据实战经验得到招式等级上限：无实战 300 级，6000 万开放 1000 级，中间开方曲线 */
    getMoveLevelCap(battleExp) {
        const exp = Number(battleExp) || 0;
        if (exp >= 6e7) return 1000;
        const t = Math.min(1, exp / 6e7);
        return Math.floor(300 + 700 * Math.pow(t, 0.5));
    },

    /**
     * 招式等级 → 威力系数曲线：500 级前约达总威力的 70%，500～1000 级解锁剩余 30%。
     * @param {number} level - 当前等级
     * @param {number} levelMax - 等级上限（默认 1000）
     * @returns {number} 0～1，用于乘在招式威力值上
     */
    getMovePowerLevelFactor(level, levelMax) {
        const lv = Math.max(0, Number(level) || 0);
        const cap = Math.max(1, Number(levelMax) || 1000);
        if (lv <= 0) return 0;
        const t = Math.min(1, lv / cap);
        if (t <= 0.5) return 0.7 * Math.pow(t / 0.5, 0.8);
        return 0.7 + 0.3 * Math.pow((t - 0.5) / 0.5, 0.8);
    },

    /**
     * 招式熟练度系数 0～1：由使用次数换算，满熟练时 100% 线性加成招式属性（即系数 1 → 属性乘 1+1=2）。
     * @param {string} moveId
     * @param {object} state - Engine.state
     * @param {object} moveDef - Engine.db.moves[moveId]，可选
     */
    getMoveProficiencyPct(moveId, state, moveDef) {
        const progress = (state && state.move_progress && state.move_progress[moveId]) || {};
        const useCount = Math.max(0, Number(progress.use_count) || 0);
        const def = moveDef || (Engine.db && Engine.db.moves && Engine.db.moves[moveId]) || {};
        const usesPerFull = Math.max(1, Number(def.uses_per_full_proficiency) || DEFAULT_USES_PER_FULL_PROFICIENCY);
        return Math.min(1, useCount / usesPerFull);
    },

    /**
     * 增加招式使用次数（战斗用招或木桩练招后调用）。与是否命中、伤害无关；次数用于熟练度线性加成。
     */
    addMoveUseCount(moveId) {
        if (!moveId) return;
        const st = Engine.state;
        const progress = st.move_progress || {};
        const moves = (Engine.db && Engine.db.moves) ? Engine.db.moves : {};
        const moveDef = moves[moveId] || {};
        let prog = progress[moveId];
        if (!prog) {
            const capByExp = CombatActions.getMoveLevelCap(st.battle_exp);
            const capByDef = moveDef.level_max != null ? Math.max(1, parseInt(moveDef.level_max, 10)) : null;
            const cap = capByDef != null ? Math.min(capByExp, capByDef) : capByExp;
            prog = { level: 1, level_max: cap, use_count: 0 };
        }
        const useCount = Math.max(0, Number(prog.use_count) || 0);
        progress[moveId] = { ...prog, use_count: useCount + 1 };
        st.move_progress = progress;
    },

    /** 家中对木桩练招：增加指定招式的使用次数，用于提升熟练度。需在家且已建造木桩。 */
    practice_move_on_dummy(c) {
        const moveId = c.move_id;
        if (!moveId) return;
        const st = Engine.state;
        const unlocked = st.unlocked_buildings || {};
        if (!unlocked.wooden_dummy) return;
        if (Engine.curId !== 'home') return;
        CombatActions.addMoveUseCount(moveId);
        const moves = (Engine.db && Engine.db.moves) ? Engine.db.moves : {};
        const def = moves[moveId] || {};
        const name = def.sn || moveId;
        Engine.log && Engine.log("你对木桩练了一回「" + name + "」，该招式熟练度略有提升。");
    },

    /** 后天有效值：实战经验线性加成，1 亿时系数 1.3 */
    getEffectiveAcq(acq, battleExp) {
        const exp = Math.min(1e8, Number(battleExp) || 0);
        return (Number(acq) || 0) * (1 + 0.3 * exp / 1e8);
    },

    /** 单部位、单类型抗性：筋骨→钝击，柔韧→刺穿/劈砍；护体开启时每肢体会加上 guard_resist_bonus。上限 70%（可突破至 90%） */
    getLimbResistance(state, limb, damageType) {
        const st = state || Engine.state;
        const sinew = (st.sinew_innate || 0) + CombatActions.getEffectiveAcq(st.sinew_acq || 0, st.battle_exp);
        const flex = (st.flex_innate || 0) + CombatActions.getEffectiveAcq(st.flex_acq || 0, st.battle_exp);
        let r = 0;
        if (damageType === 'blunt') r = Math.min(RESIST_CAP_DEFAULT, 0.02 + sinew * 0.006);
        else if (damageType === 'piercing' || damageType === 'slashing') r = Math.min(RESIST_CAP_DEFAULT, 0.01 + flex * 0.005);
        if ((st.guard_shield > 0 || (typeof st.guard_shield === 'object' && st.guard_shield && Object.keys(st.guard_shield).some(k => (st.guard_shield[k] || 0) > 0))) && (st.guard_resist_bonus != null))
            r += Number(st.guard_resist_bonus) || 0;
        return Math.min(RESIST_CAP_ABSOLUTE, r);
    },

    /** 一次伤害经抗性与护体盾后的实际扣血。护盾为全身共用，先扣护盾再按该肢体抗性（含护体抗性增强）减伤扣肢体。 */
    applyDamageWithResistance(limb, rawAmount, damageType) {
        if (rawAmount <= 0) return;
        const st = Engine.state;
        const shieldTotal = typeof st.guard_shield === 'number' ? st.guard_shield : (st.guard_shield && Object.keys(st.guard_shield).reduce((s, k) => s + (Number(st.guard_shield[k]) || 0), 0)) || 0;
        let remaining = rawAmount;
        if (shieldTotal > 0) {
            const absorb = Math.min(shieldTotal, remaining);
            st.guard_shield = typeof st.guard_shield === 'number' ? Math.max(0, st.guard_shield - absorb) : (function () {
                const o = st.guard_shield || {};
                const keys = Object.keys(o);
                let left = absorb;
                for (const k of keys) {
                    const v = Number(o[k]) || 0;
                    const take = Math.min(v, left);
                    o[k] = Math.max(0, v - take);
                    left -= take;
                    if (left <= 0) break;
                }
                return o;
            })();
            remaining -= absorb;
            if (shieldTotal - absorb <= 0) st.guard_resist_bonus = 0;
        }
        const resist = CombatActions.getLimbResistance(st, limb, damageType);
        const afterResist = remaining * (1 - resist);
        if (afterResist > 0) Effects.applyLimbDamage(limb, -afterResist);
    },

    /** 对任意目标 state 造成伤害（用于敌人）。不触发玩家死亡流程。 */
    applyDamageToState(targetState, limb, rawAmount, damageType) {
        if (!targetState || rawAmount <= 0) return;
        const resist = CombatActions.getLimbResistance(targetState, limb, damageType);
        const shield = (targetState.guard_shield && targetState.guard_shield[limb]) || 0;
        let remaining = rawAmount;
        if (shield > 0) {
            const absorb = Math.min(shield, remaining);
            targetState.guard_shield[limb] = Math.max(0, shield - absorb);
            remaining -= absorb;
        }
        const afterResist = remaining * (1 - resist);
        if (afterResist <= 0) return;
        const cur = targetState.limbs && targetState.limbs[limb];
        if (cur != null) {
            const dmg = Math.min(cur, afterResist);
            targetState.limbs[limb] -= dmg;
            let overflow = afterResist - dmg;
            if (overflow > 0 && targetState.limbs) {
                const alive = Object.keys(targetState.limbs).filter(k => (targetState.limbs[k] || 0) > 0);
                if (alive.length > 0) {
                    const share = overflow / alive.length;
                    alive.forEach(k => { targetState.limbs[k] = Math.max(0, (targetState.limbs[k] || 0) - share); });
                }
            }
        }
    },

    /** 目标是否已死（头/胸为 0 或全身为 0） */
    isTargetDead(state) {
        if (!state || !state.limbs) return true;
        const limbs = state.limbs;
        const maxL = state.maxLimbs || {};
        if (limbs.head != null && maxL.head != null && limbs.head <= 0) return true;
        if (limbs.chest != null && maxL.chest != null && limbs.chest <= 0) return true;
        const total = Object.keys(limbs).reduce((s, k) => s + (limbs[k] || 0), 0);
        return total <= 0;
    },

    /** 按权重随机选一个部位（用于命中部位） */
    pickLimbByWeights(weights) {
        const entries = Object.entries(weights || {});
        if (entries.length === 0) return 'chest';
        const sum = entries.reduce((s, [, w]) => s + (Number(w) || 0), 0);
        let r = Math.random() * sum;
        for (const [limb, w] of entries) {
            r -= Number(w) || 0;
            if (r <= 0) return limb;
        }
        return entries[entries.length - 1][0];
    },

    /** 速度 = 身手 + 身法（等级或 0），简化无装备乘区 */
    getSpeed(state) {
        const st = state || Engine.state;
        const reflex = (st.reflex_innate || 0) + (st.reflex_acq || 0);
        const movementProg = (st.combat_skill_progress && st.combat_skill_progress.basic_movement) || {};
        const movementLv = movementProg.level || 0;
        return reflex + movementLv;
    },

    /** 命中率：己方命中值/(己方+对方闪避值)，限制 [0.05, 0.95] */
    getHitRate(attackerState, defenderState) {
        const hitVal = (attackerState.reflex_innate || 0) + (attackerState.reflex_acq || 0);
        const defProg = (defenderState.combat_skill_progress && defenderState.combat_skill_progress.basic_movement) || {};
        const evadeVal = (defenderState.reflex_innate || 0) + (defenderState.reflex_acq || 0) + (defProg.level || 0);
        const rate = hitVal / (hitVal + evadeVal + 1e-6);
        return Math.max(0.05, Math.min(0.95, rate));
    },

    /**
     * 环境变量乘区：惯用手（非惯用手 0.9）、场景等。当前未接肢体/技能槽时默认 1；后续接入惯用手与场景 id 后在此计算。
     */
    getEnvironmentMult(state, moveId, moveDef) {
        let mult = 1;
        const dominantHand = state.dominant_hand;
        const limbReqs = (moveDef && moveDef.limb_requirements) || [];
        if (dominantHand && Array.isArray(limbReqs) && limbReqs.length > 0) {
            const isOffHand = (dominantHand === 'right' && limbReqs.includes('l_arm')) || (dominantHand === 'left' && limbReqs.includes('r_arm'));
            if (isOffHand) mult *= 0.9;
        }
        if (state.environment_damage_mult != null) mult *= Number(state.environment_damage_mult) || 1;
        return mult;
    },

    /**
     * 实战经验对伤害的加成乘区。例如 1 亿实战时最多 1.2 倍。
     */
    getBattleExpDamageMult(state) {
        const exp = Math.min(1e8, Number(state.battle_exp) || 0);
        return 1 + 0.2 * (exp / 1e8);
    },

    /** 哲学属性对招式威力的伤害乘区（加在招式威力加成上）。从装备内功的 tier 与各哲学 value 按 philosophy_bonuses 计算，无配置时返回 1。 */
    getPhilosophyDamageMult(neigongDef) {
        if (!neigongDef || typeof Engine === 'undefined' || !Engine.db) return 1;
        const pb = Engine.db.philosophy_bonuses;
        const tierPlan = Engine.db.neigong_tier_philosophy;
        if (!pb || !pb.philosophy_effects || !tierPlan || !tierPlan.tier_philosophy_keys) return 1;
        const tier = Math.max(1, Math.min(8, parseInt(neigongDef.tier, 10) || 1));
        const tierStrength = (pb.tier_strength && pb.tier_strength[String(tier)] != null) ? Number(pb.tier_strength[String(tier)]) : 1;
        const keys = tierPlan.tier_philosophy_keys[String(tier)];
        if (!Array.isArray(keys) || keys.length === 0) return 1;
        let mult = 1;
        for (const key of keys) {
            const val = neigongDef[key];
            if (val == null) continue;
            const v = Number(val) || 0;
            const eff = pb.philosophy_effects[key];
            if (!eff || !eff.effects) continue;
            for (const e of eff.effects) {
                if (e.stat !== 'damage_mult' || !e.formula) continue;
                const m = e.formula.match(/1\s*\+\s*([\d.]+)\s*\*\s*value/);
                if (!m) continue;
                const coef = parseFloat(m[1]) || 0;
                mult *= 1 + coef * tierStrength * v;
            }
        }
        return mult;
    }
};

// Run 命令：供战斗流程或事件调用
const CombatRunHandlers = {
    apply_damage_with_resistance(c) {
        const limb = c.limb;
        const raw = Number(c.raw) || 0;
        const type = (c.damage_type === 'piercing' || c.damage_type === 'slashing' || c.damage_type === 'blunt') ? c.damage_type : 'blunt';
        if (limb && raw > 0) CombatActions.applyDamageWithResistance(limb, raw, type);
    },
    mod_potential(c) {
        const v = Engine.state.potential + (Number(c.val) || 0);
        Engine.state.potential = Math.max(0, Math.min(5000000, v));
    },
    mod_battle_exp(c) {
        const v = Engine.state.battle_exp + (Number(c.val) || 0);
        Engine.state.battle_exp = Math.max(0, Math.min(1e8, v));
    },
    set_move_progress(c) {
        const moveId = c.move_id;
        if (!moveId) return;
        const progress = Engine.state.move_progress || {};
        const moves = (Engine.db && Engine.db.moves) ? Engine.db.moves : {};
        const moveDef = moves[moveId] || {};
        const level = Math.max(1, parseInt(c.level, 10) || 1);
        const capByExp = typeof CombatActions !== 'undefined' ? CombatActions.getMoveLevelCap(Engine.state.battle_exp) : 1000;
        const capByDef = moveDef.level_max != null ? Math.max(1, parseInt(moveDef.level_max, 10)) : null;
        const cap = capByDef != null ? Math.min(capByExp, capByDef) : capByExp;
        const prev = progress[moveId] || {};
        const useCount = c.use_count != null ? Math.max(0, parseInt(c.use_count, 10) || 0) : (prev.use_count != null ? prev.use_count : 0);
        progress[moveId] = { level: Math.min(level, cap), level_max: cap, use_count: useCount };
        Engine.state.move_progress = progress;
    },
    practice_move_on_dummy(c) {
        if (typeof CombatActions !== 'undefined' && CombatActions.practice_move_on_dummy) CombatActions.practice_move_on_dummy(c);
    },
    /** 开始修炼：学习为过程，每秒提升当前等级进度 5% 并消耗对应潜能与精力。仅启动修炼，实际结算由 main 的 startUpgradeTick 每秒执行。 */
    start_upgrade_combat_skill(c) {
        const skillId = c.skill_id;
        if (!skillId) return;
        const st = Engine.state;
        const progress = st.combat_skill_progress || {};
        const prog = progress[skillId];
        if (!prog) return;
        const level = Math.max(1, parseInt(prog.level, 10) || 1);
        const levelMax = Math.max(level, parseInt(prog.level_max, 10) || 1000);
        if (level >= levelMax) return;
        if (st.upgrading_skill_id) return;
        const cost = 10 * level;
        const potentialPerEnergy = (typeof Engine !== 'undefined' && Engine.getPotentialPerEnergy) ? Engine.getPotentialPerEnergy(st) : 500;
        const energyCost = Math.max(1, Math.ceil(cost / potentialPerEnergy));
        const costPerTick = cost * 0.05;
        const energyPerTick = energyCost * 0.05;
        const potential = Math.min(5000000, st.potential || 0);
        const energy = Math.min(st.energy_max || 100, st.energy != null ? st.energy : 100);
        if (potential < costPerTick || energy < energyPerTick) return;
        st.upgrading_skill_id = skillId;
        st.upgrading_progress = (st.last_upgrading_skill_id === skillId && st.upgrading_progress != null) ? st.upgrading_progress : 0;
        st.last_upgrading_skill_id = null;
    },
    set_limb_skill(c) {
        const st = Engine.state;
        if (!st.combat_skill_slots_by_limb) st.combat_skill_slots_by_limb = {};
        const limbKey = c.limb;
        const slotType = c.slot;
        const skillId = c.skill_id || null;
        if (!limbKey || !slotType) return;
        if (!st.combat_skill_slots_by_limb[limbKey]) st.combat_skill_slots_by_limb[limbKey] = { attack: null, parry: null };
        st.combat_skill_slots_by_limb[limbKey][slotType] = skillId;
    },
    open_guard(c) {
        const st = Engine.state;
        const cost = Math.min(st.neili || 0, Math.max(0, parseInt(c.neili_cost, 10) || 10));
        if (cost <= 0) return;
        const arts = (typeof Engine !== 'undefined' && Engine.db && Engine.db.internal_arts) ? Engine.db.internal_arts : {};
        const slotId = (st.combat_skill_slots && st.combat_skill_slots['内功']) || 'basic_internal';
        const def = arts[slotId] || {};
        const ratio = Number(def.neili_to_shield_ratio) || 0.5;
        const rawPower = Number(def.power) || 0;
        const shieldDivisor = (typeof Engine !== 'undefined' && Engine.db && Engine.db.internal_arts_power_config && Engine.db.internal_arts_power_config.guard_shield_base_divisor != null)
            ? Number(Engine.db.internal_arts_power_config.guard_shield_base_divisor) : 1.5625;
        const shieldCap = (typeof Engine !== 'undefined' && Engine.db && Engine.db.internal_arts_power_config && Engine.db.internal_arts_power_config.guard_shield_base_cap != null)
            ? Number(Engine.db.internal_arts_power_config.guard_shield_base_cap) : 600;
        const powerBase = Math.min(rawPower / (shieldDivisor || 1), shieldCap);
        const resistBonus = Number(def.guard_resist_bonus) || 0;
        st.neili = (st.neili || 0) - cost;
        const shieldGain = powerBase + cost * ratio;
        st.guard_shield = (typeof st.guard_shield === 'number' ? st.guard_shield : 0) + shieldGain;
        st.guard_resist_bonus = resistBonus;
    }
};
