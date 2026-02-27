/**
 * 背包/物品工具：纯函数或仅依赖 state 的查询，供 Engine 与各 action 模块使用。
 * 不执行 Engine.run / Engine.log，仅做 slot 解析与数量统计。
 */
const InventoryUtils = {
    getBaseItemId(key) {
        if (!key || typeof key !== 'string') return key;
        const m = key.match(/^(.+)_\d+$/);
        return m ? m[1] : key;
    },

    getNextSlotKey(inventory, baseItemId) {
        if (!inventory[baseItemId]) return baseItemId;
        let n = 1;
        while (inventory[baseItemId + '_' + n]) n++;
        return baseItemId + '_' + n;
    },

    countItemInInventory(baseItemId, inventory) {
        if (!inventory) return 0;
        let total = 0;
        for (const key of Object.keys(inventory)) {
            if (InventoryUtils.getBaseItemId(key) === baseItemId)
                total += (inventory[key] || 0) || 1;
        }
        return total;
    },

    findSlotKeyFor(baseItemId, inventory) {
        if (!inventory) return null;
        for (const k of Object.keys(inventory)) {
            if (InventoryUtils.getBaseItemId(k) === baseItemId) {
                const v = inventory[k];
                if ((typeof v === 'number' && v > 0) || v === 1) return k;
            }
        }
        return null;
    }
};
