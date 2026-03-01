/**
 * 战斗相关 run 命令与公式：三种伤害类型、按部位抗性、速度/命中/格挡、护体盾值。
 * 依赖 Engine。设计见计划：刺穿/劈砍/钝击、抗性乘算、默认上限 70%、绝对 90%。
 */
const DAMAGE_TYPES = { piercing: '刺穿', slashing: '劈砍', blunt: '钝击' };
const RESIST_CAP_DEFAULT = 0.7;
const RESIST_CAP_ABSOLUTE = 0.9;

const CombatActions = {
    /** 根据实战经验得到招式等级上限：无实战 300 级，6000 万开放 1000 级，中间开方曲线 */
    getMoveLevelCap(battleExp) {
        const exp = Number(battleExp) || 0;
        if (exp >= 6e7) return 1000;
        const t = Math.min(1, exp / 6e7);
        return Math.floor(300 + 700 * Math.pow(t, 0.5));
    },

    /** 后天有效值：实战经验线性加成，1 亿时系数 1.3 */
    getEffectiveAcq(acq, battleExp) {
        const exp = Math.min(1e8, Number(battleExp) || 0);
        return (Number(acq) || 0) * (1 + 0.3 * exp / 1e8);
    },

    /** 单部位、单类型抗性：筋骨→钝击，柔韧→刺穿/劈砍；多来源乘算前先算单源，上限 70%（可突破至 90%） */
    getLimbResistance(state, limb, damageType) {
        const st = state || Engine.state;
        const sinew = (st.sinew_innate || 0) + CombatActions.getEffectiveAcq(st.sinew_acq || 0, st.battle_exp);
        const flex = (st.flex_innate || 0) + CombatActions.getEffectiveAcq(st.flex_acq || 0, st.battle_exp);
        let r = 0;
        if (damageType === 'blunt') r = Math.min(RESIST_CAP_DEFAULT, 0.02 + sinew * 0.006);
        else if (damageType === 'piercing' || damageType === 'slashing') r = Math.min(RESIST_CAP_DEFAULT, 0.01 + flex * 0.005);
        return Math.min(RESIST_CAP_ABSOLUTE, r);
    },

    /** 一次伤害经抗性与护体盾后的实际扣血（正数为扣血量）。护体盾先吸收，再按抗性减伤扣肢体。 */
    applyDamageWithResistance(limb, rawAmount, damageType) {
        if (rawAmount <= 0) return;
        const st = Engine.state;
        const resist = CombatActions.getLimbResistance(st, limb, damageType);
        const shield = (st.guard_shield && st.guard_shield[limb]) || 0;
        let remaining = rawAmount;
        if (shield > 0) {
            const absorb = Math.min(shield, remaining);
            st.guard_shield[limb] = Math.max(0, shield - absorb);
            remaining -= absorb;
        }
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

    /** 格挡成功率：招架等级参与，简化 */
    getParryChance(state) {
        const prog = (state && state.combat_skill_progress && state.combat_skill_progress.basic_parry) || {};
        const lv = prog.level || 0;
        return Math.min(0.6, 0.05 + lv * 0.001);
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
        const level = Math.max(1, parseInt(c.level, 10) || 1);
        const proficiency = Math.max(0, parseFloat(c.proficiency) || 0);
        const cap = typeof CombatActions !== 'undefined' ? CombatActions.getMoveLevelCap(Engine.state.battle_exp) : 1000;
        progress[moveId] = { level: Math.min(level, cap), level_max: cap, proficiency };
        Engine.state.move_progress = progress;
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
    open_guard(c) {
        const st = Engine.state;
        const cost = Math.min(st.neili || 0, Math.max(0, parseInt(c.neili_cost, 10) || 10));
        if (cost <= 0) return;
        const arts = (typeof Engine !== 'undefined' && Engine.db && Engine.db.internal_arts) ? Engine.db.internal_arts : {};
        const slotId = (st.combat_skill_slots && st.combat_skill_slots['内功']) || 'basic_internal';
        const def = arts[slotId] || {};
        const ratio = Number(def.neili_to_shield_ratio) || 0.5;
        st.neili = (st.neili || 0) - cost;
        const shieldGain = cost * ratio;
        const limb = c.limb;
        if (limb) {
            if (!st.guard_shield) st.guard_shield = {};
            st.guard_shield[limb] = (st.guard_shield[limb] || 0) + shieldGain;
        } else {
            const limbs = Object.keys(st.limbs || {});
            if (!st.guard_shield) st.guard_shield = {};
            const per = limbs.length ? shieldGain / limbs.length : 0;
            limbs.forEach(l => { st.guard_shield[l] = (st.guard_shield[l] || 0) + per; });
        }
    }
};
