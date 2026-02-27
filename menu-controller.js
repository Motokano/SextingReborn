/**
 * 菜单内容与上下文选项。依赖 Engine, UI。由 main 的 render → updateMenus 调用。
 */
const MenuController = {
    update() {
        if (typeof UI === 'undefined') return;
        UI.renderMenu('self-options', Engine.db.config.sys_actions, "个人指令");
        const c = Engine.cur.grid[Engine.pIdx];
        const refObj = c.object_id ? Engine.db.objects[c.object_id] : null;

        let actionIds = c.action_ids || (refObj ? refObj.action_ids : null);
        const inlineActs = c.acts || (refObj ? refObj.acts : null);
        if (actionIds) {
            const s = Engine.state;
            if (s.combat_awareness && actionIds.includes('read_sword_manual')) actionIds = actionIds.filter(id => id !== 'read_sword_manual');
            if (s.survival_skills && s.survival_skills['breathing'] && actionIds.includes('read_breathing_manual')) actionIds = actionIds.filter(id => id !== 'read_breathing_manual');
            if (s.production_skills && s.production_skills['mining'] && actionIds.includes('read_mining_manual')) actionIds = actionIds.filter(id => id !== 'read_mining_manual');
            if (s.production_skills && s.production_skills['logging'] && actionIds.includes('read_logging_manual')) actionIds = actionIds.filter(id => id !== 'read_logging_manual');
            if (s.support_skills && s.support_skills['probe'] && actionIds.includes('read_probe_manual')) actionIds = actionIds.filter(id => id !== 'read_probe_manual');
            if (s.survival_skills && s.survival_skills['gathering'] && actionIds.includes('read_gathering_manual')) actionIds = actionIds.filter(id => id !== 'read_gathering_manual');
            if (s.survival_skills && s.survival_skills['fishing'] && actionIds.includes('read_fishing_manual')) actionIds = actionIds.filter(id => id !== 'read_fishing_manual');
            if (s.production_skills && s.production_skills['farming'] && actionIds.includes('read_farming_manual')) actionIds = actionIds.filter(id => id !== 'read_farming_manual');
            if (s.survival_skills && s.survival_skills['hunting'] && actionIds.includes('read_hunting_manual')) actionIds = actionIds.filter(id => id !== 'read_hunting_manual');
            if (Engine.getSkillProgress) {
                const miningProg = Engine.getSkillProgress('production', 'mining');
                if (!miningProg) actionIds = actionIds.filter(id => id !== 'mine_manual' && id !== 'mine_auto');
                const gatheringProg = Engine.getSkillProgress('survival', 'gathering');
                if (!gatheringProg) actionIds = actionIds.filter(id => id !== 'gather_berries' && id !== 'gather_herbs');
                const loggingProg = Engine.getSkillProgress('production', 'logging');
                if (!loggingProg) actionIds = actionIds.filter(id => id !== 'chop_manual' && id !== 'chop_auto');
                const fishingProg = Engine.getSkillProgress('survival', 'fishing');
                if (!fishingProg) actionIds = actionIds.filter(id => id !== 'fish_manual' && id !== 'fish_auto');
            }
            if (Engine.hasFishingRod && !Engine.hasFishingRod()) {
                actionIds = actionIds.filter(id => id !== 'fish_manual' && id !== 'fish_auto');
            }
            if (Engine.getSkillProgress) {
                const farmingProg = Engine.getSkillProgress('production', 'farming');
                if (!farmingProg) actionIds = actionIds.filter(id => id !== 'harvest_crops');
                const huntingProg = Engine.getSkillProgress('survival', 'hunting');
                if (!huntingProg) actionIds = actionIds.filter(id => id !== 'hunt_manual' && id !== 'hunt_auto');
            }
        }

        const ctxSec = document.getElementById('context-section');
        if (actionIds && actionIds.length > 0) {
            ctxSec.classList.remove('hidden');
            UI.renderMenu('context-options', actionIds, c.fn || (refObj ? refObj.fn : "当前"));
        } else if (inlineActs && inlineActs.length > 0) {
            ctxSec.classList.remove('hidden');
            UI.renderMenu('context-options', inlineActs, c.fn || (refObj ? refObj.fn : "当前"));
        } else {
            ctxSec.classList.add('hidden');
        }
        if (UI.renderNpcList) UI.renderNpcList();
    }
};
