/**
 * 技能相关 run 命令：learn_survival/production/support/combat_skill, gain_skill_exp, set_combat_skill, grant_combat_awareness。
 * 依赖 Engine。
 */
const SkillActions = {
    set_combat_skill(c) {
        const slots = Engine.state.combat_skill_slots || {};
        const slotKey = c.slot;
        if (slotKey && Object.prototype.hasOwnProperty.call(slots, slotKey)) {
            slots[slotKey] = c.skill_id || null;
            Engine.state.combat_skill_slots = slots;
        }
    },

    grant_combat_awareness() {
        Engine.state.combat_awareness = true;
    },

    learn_combat_skill(c) {
        const slotKey = c.slot;
        const skillId = c.skill_id;
        const slots = Engine.state.combat_skill_slots || {};
        const progress = Engine.state.combat_skill_progress || {};
        if (slotKey && Object.prototype.hasOwnProperty.call(slots, slotKey) && skillId) {
            const level = Math.max(1, parseInt(c.level, 10) || 1);
            const levelMax = Math.max(level, parseInt(c.level_max, 10) || 500);
            const proficiency = Math.max(0, parseFloat(c.proficiency) || 0);
            slots[slotKey] = skillId;
            progress[skillId] = { level, level_max: levelMax, proficiency };
            Engine.state.combat_skill_slots = slots;
            Engine.state.combat_skill_progress = progress;
        }
    },

    learn_survival_skill(c) {
        const skillId = c.skill_id;
        const skills = Engine.state.survival_skills || {};
        if (skillId) {
            const level = Math.max(1, parseInt(c.level, 10) || 1);
            const levelMax = Math.max(level, parseInt(c.level_max, 10) || 100);
            const proficiency = Math.max(0, parseFloat(c.proficiency) || 0);
            skills[skillId] = { level, level_max: levelMax, proficiency };
            Engine.state.survival_skills = skills;
        }
    },

    learn_production_skill(c) {
        const skillId = c.skill_id;
        const skills = Engine.state.production_skills || {};
        if (skillId) {
            const level = Math.max(1, parseInt(c.level, 10) || 1);
            const levelMax = Math.max(level, parseInt(c.level_max, 10) || 100);
            const proficiency = Math.max(0, parseFloat(c.proficiency) || 0);
            skills[skillId] = { level, level_max: levelMax, proficiency };
            Engine.state.production_skills = skills;
        }
    },

    learn_support_skill(c) {
        const skillId = c.skill_id;
        const skills = Engine.state.support_skills || {};
        if (skillId) {
            const level = Math.max(1, parseInt(c.level, 10) || 1);
            const levelMax = Math.max(level, parseInt(c.level_max, 10) || 100);
            const proficiency = Math.max(0, parseFloat(c.proficiency) || 0);
            skills[skillId] = { level, level_max: levelMax, proficiency };
            Engine.state.support_skills = skills;
        }
    },

    gain_skill_exp(c) {
        const category = c.category;
        const skillId = c.skill_id;
        const amount = Math.max(0, parseFloat(c.amount) || 0);
        if (!category || !skillId || amount <= 0) return;

        let skills;
        if (category === 'survival') skills = Engine.state.survival_skills || (Engine.state.survival_skills = {});
        else if (category === 'production') skills = Engine.state.production_skills || (Engine.state.production_skills = {});
        else if (category === 'support') skills = Engine.state.support_skills || (Engine.state.support_skills = {});
        else return;

        const prog = skills[skillId];
        if (!prog) return;

        prog.proficiency = (prog.proficiency || 0) + amount;
        const maxLv = prog.level_max || 100;
        while (prog.proficiency >= 100 && prog.level < maxLv) {
            prog.proficiency -= 100;
            prog.level += 1;
            Engine.log("你似乎对这项技艺多了一分理解。");
        }
        skills[skillId] = prog;
    }
};
