/**
 * Buff 相关 run 命令：add_buff, remove_buff。依赖 Engine。
 * canApplyBuff 供 add_buff 使用，可由 Engine 暴露为 Engine.canApplyBuff。
 */
const BuffActions = {
    canApplyBuff(buffDef, charDef) {
        if (!buffDef || !buffDef.requirements) return true;
        const charTags = charDef && charDef.tags || [];
        if (buffDef.requirements.forbidden_tags) {
            if (buffDef.requirements.forbidden_tags.some(tag => charTags.includes(tag))) return false;
        }
        if (buffDef.requirements.required_tags) {
            if (!buffDef.requirements.required_tags.every(tag => charTags.includes(tag))) return false;
        }
        return true;
    },

    add_buff(c) {
        const buffDef = Engine.db.buffs && Engine.db.buffs.definitions && Engine.db.buffs.definitions[c.id];
        if (!buffDef || !Engine.canApplyBuff(buffDef, Engine.db.npcs[Engine.pID])) return;

        const existingBuff = Engine.state.buffs.find(b => b.id === c.id);
        if (existingBuff) {
            existingBuff.duration = buffDef.duration;
        } else {
            Engine.state.buffs.push({ id: c.id, duration: buffDef.duration });
            if (buffDef.effects && buffDef.effects.on_add) Engine.run(buffDef.effects.on_add);
        }
    },

    remove_buff(c) {
        const buffIdx = Engine.state.buffs.findIndex(b => b.id === c.id);
        if (buffIdx > -1) {
            const buffDef = Engine.db.buffs && Engine.db.buffs.definitions && Engine.db.buffs.definitions[c.id];
            Engine.state.buffs.splice(buffIdx, 1);
            if (buffDef && buffDef.effects && buffDef.effects.on_remove) Engine.run(buffDef.effects.on_remove);
        }
    }
};
