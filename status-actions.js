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
    }
};
