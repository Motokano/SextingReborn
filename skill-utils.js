/**
 * 技能相关工具：进度查询、等级区间、是否解锁等。只读 state，不执行命令。
 */
const SkillUtils = {
    getSkillProgress(state, category, skillId) {
        const s = state || (typeof Engine !== 'undefined' ? Engine.state : null);
        if (!s) return null;
        if (category === 'survival') return (s.survival_skills || {})[skillId];
        if (category === 'production') return (s.production_skills || {})[skillId];
        if (category === 'support') return (s.support_skills || {})[skillId];
        return null;
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
