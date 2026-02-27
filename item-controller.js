/**
 * 物品操作：显示使用/丢弃等选项、执行使用效果。依赖 Engine, UI。
 */
const ItemController = {
    showItemActions(itemId) {
        const baseId = Engine.getBaseItemId(itemId);
        const item = (Engine.db.objects && Engine.db.objects[baseId]) || (Engine.db.items && Engine.db.items[baseId]);
        if (!item) return;
        const displayName = (UI && UI.getItemDisplayName) ? UI.getItemDisplayName(baseId, Engine.state) : (item.sn || baseId);
        const options = [];
        if (item.effect_id) options.push({ key: 'use', text: '使用' });
        else if (item.action_ids && item.action_ids.length > 0) {
            item.action_ids.forEach(actionId => {
                const action = Engine.db.actions[actionId];
                if (action && action.label) options.push({ key: actionId, text: action.label });
            });
        }
        options.push({ key: 'drop', text: '丢到地上' });

        const subtitleEl = document.getElementById('choice-modal-subtitle');
        if (subtitleEl) {
            subtitleEl.textContent = '选择你想对这个物品做什么。';
            subtitleEl.style.display = '';
        }
        UI.showChoiceModal(`选择对 ${displayName} 的操作`, options, (actionId) => {
            if (actionId === 'drop') {
                Engine.run([{ type: 'drop_to_ground', item_id: itemId, count: 1 }]);
                Engine.render();
                return;
            }
            if (actionId === 'use' && item.effect_id) {
                ItemController.useItem(itemId);
                return;
            }
            Engine.performAction(actionId, { itemId: itemId });
        }, 'manual');
    },

    useItem(itemId) {
        const baseId = Engine.getBaseItemId(itemId);
        const item = (Engine.db.objects && Engine.db.objects[baseId]) || (Engine.db.items && Engine.db.items[baseId]);
        if (!item) return;
        const effectId = item.effect_id;
        const effectParams = item.effect_params || {};
        if (!effectId) {
            Engine.log(`你不知道该怎么使用${item.sn}。`);
            return;
        }
        const targetMode = item.use_target || 'self';
        const scope = item.use_scope || 'single_limb';
        const limbFilter = item.use_limb_filter || 'alive_only';
        const applyForTarget = (target) => {
            Engine.applyEffect(effectId, { ...effectParams, scope, limbFilter, itemId }, target);
        };
        if (targetMode === 'self') {
            applyForTarget({ type: 'self' });
        } else {
            const npcsInScene = Array.from(new Set(
                Engine.cur.grid.filter(c => c.npc_id).map(c => c.npc_id)
            ));
            const options = [];
            if (targetMode === 'self_or_npc') options.push({ key: 'self', text: '自己' });
            npcsInScene.forEach(id => {
                const def = Engine.db.npcs[id];
                if (def) options.push({ key: `npc:${id}`, text: def.sn || id });
            });
            if (options.length === 0) {
                Engine.log("这里没有可以使用的目标。");
                return;
            }
            UI.showChoiceModal(`选择使用${item.sn}的目标`, options, key => {
                if (key === 'self') applyForTarget({ type: 'self' });
                else if (key.startsWith('npc:')) applyForTarget({ type: 'npc', id: key.slice(4) });
            });
        }
    }
};
