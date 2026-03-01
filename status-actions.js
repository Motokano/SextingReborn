/**
 * 状态/数值类 run 命令：mod_stat, recover_limbs_ratio, hp_limb。依赖 Engine。
 */
const StatusActions = {
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
        st.meditating = !st.meditating;
        Engine.log(st.meditating ? "你盘膝坐下，开始吐纳调息。" : "你收功起身。");
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
