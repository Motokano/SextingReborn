/**
 * 状态/数值类 run 命令：mod_stat, recover_limbs_ratio, hp_limb。依赖 Engine。
 */
const INTERNAL_PROFICIENCY_USES_PER_100 = 50000; // 5 万次使用满 100% 熟练

const StatusActions = {
    /** 为当前装备内功增加熟练度（打坐/吐气纳精/血气化劲均视为使用一次）。默认 5 万次满 100%。 */
    addInternalProficiency(amount) {
        const st = Engine.state;
        const skillId = st.combat_skill_slots && st.combat_skill_slots['内功'];
        if (!skillId) return;
        const progress = st.combat_skill_progress || {};
        const prog = progress[skillId];
        if (!prog) return;
        const perUse = 100 / INTERNAL_PROFICIENCY_USES_PER_100;
        const add = (amount || 1) * perUse;
        prog.proficiency = Math.min(100, Math.max(0, (prog.proficiency != null ? prog.proficiency : 0) + add));
        st.combat_skill_progress = progress;
    },

    mod_stat(c) {
        const key = c.key;
        let v = (Engine.state[key] || 0) + Number(c.val);
        if (key === 'mood') v = Math.max(-50, Math.min(50, v));
        else if (key === 'nutrition') v = Math.max(0, Math.min(100, v));
        else if (key === 'energy') v = Math.max(0, Math.min(Engine.state.energy_max || 100, v));
        else v = Math.max(0, Math.min(100, v));
        Engine.state[key] = v;
    },

    recover_limbs_ratio(c) {
        const val = Number(c.val);
        Object.keys(Engine.state.limbs).forEach(l => {
            const m = Engine.state.maxLimbs[l];
            Engine.state.limbs[l] = Math.min(m, Engine.state.limbs[l] + m * val);
        });
    },

    hp_limb(c) {
        Engine.applyLimbDamage(c.limb, Number(c.val));
    },

    set_has_time_building(c) {
        const v = (c && Object.prototype.hasOwnProperty.call(c, 'val')) ? !!c.val : true;
        Engine.state.has_time_building = v;
    },

    unlock_building(c) {
        const id = c && c.building_id;
        if (!id) return;
        if (!Engine.state.unlocked_buildings) Engine.state.unlocked_buildings = {};
        Engine.state.unlocked_buildings[id] = true;
    },

    apply_resurrect_penalties(c) {
        const st = Engine.state;
        if (st.limbs) Object.keys(st.limbs).forEach(k => { st.limbs[k] = 1; });
        st.neili = 0;
        st.neili_max = Math.max(0, Math.floor((st.neili_max || 0) / 2));
        if (st.guard_shield) Object.keys(st.guard_shield).forEach(k => { st.guard_shield[k] = 0; });
        const progress = st.combat_skill_progress || {};
        Object.keys(progress).forEach(skillId => {
            const p = progress[skillId];
            if (p && typeof p.level === 'number') p.level = Math.max(1, p.level - 50);
        });
        st.combat_skill_progress = progress;
    },

    trigger_death(c) {
        Engine.log("<span style='color:#800'>你已气绝，魂魄离体，恍惚间被引向阴曹...</span>");
        Movement.loadScene('underworld', 5);
    },

    toggle_meditate(c) {
        const st = Engine.state;
        if (!st.meditating) {
            const hasInternal = st.combat_skill_slots && st.combat_skill_slots['内功'] != null;
            if (!hasInternal) {
                Engine.log("你尚未习得任何内功，无法吐纳运功。");
                return;
            }
        }
        st.meditating = !st.meditating;
        Engine.log(st.meditating ? "你盘膝坐下，开始吐纳调息。" : "你收功起身。");
        if (st.meditating) StatusActions.addInternalProficiency(1);
    },

    /** 吐气纳精：消耗内力恢复精力。比例由当前装备内功的 neili_to_energy_ratio 决定，默认 10 内力 = 1 精力。无内功时不可用。 */
    exhale_absorb(c) {
        const st = Engine.state;
        const slotId = st.combat_skill_slots && st.combat_skill_slots['内功'];
        if (slotId == null) {
            Engine.log("你尚未习得任何内功，无法吐气纳精。");
            return;
        }
        const arts = (Engine.db && Engine.db.internal_arts) ? Engine.db.internal_arts : {};
        const def = arts[slotId] || {};
        const ratio = Math.max(1, parseInt(def.neili_to_energy_ratio, 10) || 10);
        const neili = st.neili != null ? st.neili : 0;
        if (neili < ratio) {
            Engine.log("内力不足，无法吐气纳精。");
            return;
        }
        const energyMax = st.energy_max != null ? st.energy_max : 100;
        const energy = Math.min(energyMax, (st.energy != null ? st.energy : 100) + 1);
        st.neili = neili - ratio;
        st.energy = energy;
        Engine.log(`你吐气纳精，内力化作精力。`);
        StatusActions.addInternalProficiency(1);
    },

    /** 血气化劲：扣 1 点肢体血量换 10 点内力。随机选一肢体 -1，不得扣至 0；全身无多余血量时自动停止。需内功。 */
    limb_to_neili(c) {
        const st = Engine.state;
        if (!st.combat_skill_slots || st.combat_skill_slots['内功'] == null) {
            Engine.log("你尚未习得任何内功，无法血气化劲。");
            return;
        }
        const limbs = st.limbs || {};
        const candidates = Object.keys(limbs).filter(k => (limbs[k] != null && Number(limbs[k]) > 1));
        if (candidates.length === 0) {
            Engine.log("全身没有多余的血量，无法继续。");
            return;
        }
        const limbKey = candidates[Math.floor(Math.random() * candidates.length)];
        st.limbs[limbKey] = Number(limbs[limbKey]) - 1;
        const neiliMax = st.neili_max != null ? st.neili_max : 0;
        st.neili = Math.min(neiliMax, (st.neili != null ? st.neili : 0) + 10);
        Engine.log(`你血气化劲，略损肢体，内力有所恢复。`);
        StatusActions.addInternalProficiency(1);
    },

    start_combat(c) {
        let ids = c.enemy_ids;
        if (c.enemy_ids_from === 'object') {
            const cell = Engine.cur && Engine.cur.grid && Engine.cur.grid[Engine.pIdx];
            const ref = cell && cell.object_id && Engine.db.objects && Engine.db.objects[cell.object_id];
            ids = (ref && ref.enemy_ids) ? ref.enemy_ids : (ids || []);
        }
        if (ids && typeof CombatEngine !== 'undefined') CombatEngine.startCombat(ids);
    }
};
