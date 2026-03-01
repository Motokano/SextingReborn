/**
 * 菜单内容与上下文选项。依赖 Engine, UI。由 main 的 render → updateMenus 调用。
 */
const MenuController = {
    update() {
        if (typeof UI === 'undefined') return;
        const selfActions = Engine.curId === 'home'
            ? [...(Engine.db.config.sys_actions || []), 'open_build_menu']
            : (Engine.db.config.sys_actions || []);
        UI.renderMenu('self-options', selfActions, "个人指令");
        const c = Engine.cur.grid[Engine.pIdx];
        const refObj = c.object_id ? Engine.db.objects[c.object_id] : null;

        let actionIds = c.action_ids || (refObj ? refObj.action_ids : null);
        const inlineActs = c.acts || (refObj ? refObj.acts : null);

        if (Engine.curId === 'home' && !inlineActs) {
            const list = Engine.state.home_farmland || [];
            const crops = Engine.state.home_crops || {};
            const key = String(Engine.pIdx);
            const hasCrop = crops[key];
            if (c.farmland) {
                if (hasCrop) {
                    const day = Engine.state.day_index || 1;
                    const plantedAt = hasCrop.planted_at != null ? hasCrop.planted_at : day;
                    const daysGrown = day - plantedAt;
                    const mature = daysGrown >= 1 && daysGrown <= 30;
                    const farmingLv = (Engine.getSkillProgress && Engine.getSkillProgress('production', 'farming') || {}).level || 0;
                    if (mature) {
                        actionIds = (actionIds ? [...actionIds] : []).concat(['harvest_home_crop', 'select_seed_home_crop', 'remove_farmland']);
                        if (farmingLv >= 5) actionIds.push('refine_seed_home_crop');
                    } else {
                        actionIds = (actionIds ? [...actionIds] : []).concat(['harvest_home_crop', 'remove_farmland']);
                    }
                } else {
                    actionIds = (actionIds ? [...actionIds] : []).concat(['sow_home_crop', 'remove_farmland']);
                }
            } else if (list.length < 4 && !c.object_id && !c.npc_id && (!c.sn || c.sn === '')) {
                actionIds = (actionIds ? [...actionIds] : []).concat(['designate_farmland']);
            }
        }

        if (actionIds && Array.isArray(actionIds)) {
            if (Engine.curId === 'home' && Engine.canUpgradeCurrentBuilding && Engine.canUpgradeCurrentBuilding()) {
                actionIds = [...actionIds, 'upgrade_building'];
            }
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
            if (s.production_skills && s.production_skills['cooking'] && actionIds.includes('read_cooking_manual')) actionIds = actionIds.filter(id => id !== 'read_cooking_manual');
            if (s.production_skills && s.production_skills['medicine'] && actionIds.includes('read_medicine_manual')) actionIds = actionIds.filter(id => id !== 'read_medicine_manual');
            if (s.production_skills && s.production_skills['leatherworking'] && actionIds.includes('read_leatherworking_manual')) actionIds = actionIds.filter(id => id !== 'read_leatherworking_manual');
            if (s.production_skills && s.production_skills['smithing'] && actionIds.includes('read_smithing_manual')) actionIds = actionIds.filter(id => id !== 'read_smithing_manual');
            if (s.production_skills && s.production_skills['carpentry'] && actionIds.includes('read_carpentry_manual')) actionIds = actionIds.filter(id => id !== 'read_carpentry_manual');
            if (s.production_skills && s.production_skills['tailoring'] && actionIds.includes('read_tailoring_manual')) actionIds = actionIds.filter(id => id !== 'read_tailoring_manual');
            if (s.production_skills && s.production_skills['enchanting'] && actionIds.includes('read_enchanting_manual')) actionIds = actionIds.filter(id => id !== 'read_enchanting_manual');
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
                if (!farmingProg) actionIds = actionIds.filter(id => id !== 'harvest_crops' && id !== 'sow_home_crop' && id !== 'harvest_home_crop' && id !== 'select_seed_home_crop' && id !== 'refine_seed_home_crop');
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
