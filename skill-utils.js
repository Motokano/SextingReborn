/**
 * 技能相关工具：进度查询、等级区间、是否解锁等。只读 state，不执行命令。
 * 生活技能等级仅由使用次数决定：五万次满级，曲线 level = level_max * (use_count/50000)^0.5。
 */
const LIFE_SKILL_USE_CAP = 50000;

const SkillUtils = {
    /** 生活技能由 use_count 换算等级（曲线，50000 次满级）。无 use_count 时按旧数据返回 level。 */
    getLifeSkillLevel(prog) {
        if (!prog) return 1;
        if (prog.use_count == null) return Math.max(1, parseInt(prog.level, 10) || 1);
        const useCount = Math.min(LIFE_SKILL_USE_CAP, Math.max(0, Number(prog.use_count) || 0));
        const maxLv = Math.max(1, parseInt(prog.level_max, 10) || 100);
        const level = Math.floor(maxLv * Math.pow(useCount / LIFE_SKILL_USE_CAP, 0.5));
        return Math.max(1, Math.min(maxLv, level));
    },

    getSkillProgress(state, category, skillId) {
        const s = state || (typeof Engine !== 'undefined' ? Engine.state : null);
        if (!s) return null;
        let raw = null;
        if (category === 'survival') raw = (s.survival_skills || {})[skillId];
        else if (category === 'production') raw = (s.production_skills || {})[skillId];
        else if (category === 'support') raw = (s.support_skills || {})[skillId];
        if (!raw) return null;
        const level = SkillUtils.getLifeSkillLevel(raw);
        return { ...raw, level };
    },

    getMiningBand(level) {
        const lv = Math.max(1, parseInt(level, 10) || 1);
        return Math.max(1, Math.min(10, Math.ceil(lv / 10)));
    },

    hasCombatAwareness(state) {
        const s = state || (typeof Engine !== 'undefined' ? Engine.state : null);
        return s && s.combat_awareness === true;
    },

    hasAnySkillCategoryUnlocked(state) {
        const s = state || (typeof Engine !== 'undefined' ? Engine.state : null);
        if (!s) return false;
        if (Object.keys(s.survival_skills || {}).length > 0) return true;
        if (Object.keys(s.production_skills || {}).length > 0) return true;
        if (s.combat_awareness === true) return true;
        if (Object.keys(s.support_skills || {}).length > 0) return true;
        return false;
    },

    hasAnyCombatSkill(state) {
        const s = state || (typeof Engine !== 'undefined' ? Engine.state : null);
        if (!s) return false;
        const slots = s.combat_skill_slots || {};
        return Object.keys(slots).some(k => slots[k] != null && slots[k] !== '');
    },

    hasFishingRod(state) {
        if (typeof InventoryUtils === 'undefined') return false;
        const inv = state && state.inventory || (typeof Engine !== 'undefined' ? Engine.state.inventory : null);
        return inv ? InventoryUtils.countItemInInventory('fishing_rod', inv) > 0 : false;
    }
};
