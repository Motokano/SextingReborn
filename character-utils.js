/**
 * 角色/属性工具：种族与个体属性应用、属性值计算、NPC 状态。依赖 Engine.db。
 * Engine 在 init 与查询时调用，不直接出现在 run(cmd) 中。
 */
const CharacterUtils = {
    applyCharacterAttributes(state, charDef) {
        const attrs = charDef && charDef.attributes;
        const defs = typeof Engine !== 'undefined' && Engine.db && Engine.db.character_attributes && Engine.db.character_attributes.attribute_definitions;
        if (!attrs || !defs) return;
        for (const [attrKey, valueKey] of Object.entries(attrs)) {
            const attrDef = defs[attrKey];
            if (!attrDef || !attrDef.values || !attrDef.values[valueKey]) continue;
            const mods = attrDef.values[valueKey].modifiers || {};
            for (const [modKey, val] of Object.entries(mods)) {
                if (modKey.endsWith('_mult')) {
                    const baseKey = modKey.slice(0, -5);
                    if (state[baseKey] != null && typeof state[baseKey] === 'number') {
                        state[baseKey] = Math.max(0, Math.floor(state[baseKey] * val));
                    } else {
                        state[modKey] = val;
                    }
                } else if (modKey.endsWith('_mod')) {
                    const baseKey = modKey.slice(0, -4);
                    state[baseKey] = Math.max(0, (state[baseKey] ?? 0) + val);
                }
            }
        }
    },

    getEffectiveAttr(state, attrKey) {
        const s = state || (typeof Engine !== 'undefined' ? Engine.state : null);
        if (!s) return 10;
        const innate = s[attrKey + '_innate'];
        const acq = s[attrKey + '_acq'];
        return (innate != null ? innate : 10) + (acq != null ? acq : 0);
    },

    getNpcState(npcId) {
        if (!npcId || typeof Engine === 'undefined') return null;
        if (Engine.npcStates && Engine.npcStates[npcId]) return Engine.npcStates[npcId];
        const npcDef = Engine.db.npcs[npcId];
        if (!npcDef) return null;
        const race = Engine.db.races.find(r => r.id === npcDef.race);
        if (!race) return null;
        const st = JSON.parse(JSON.stringify(race.base_stats));
        if (!st.buffs) st.buffs = [];
        CharacterUtils.applyCharacterAttributes(st, npcDef);
        if (!Engine.npcStates) Engine.npcStates = {};
        Engine.npcStates[npcId] = st;
        return st;
    }
};
