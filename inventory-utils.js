/**
 * 背包/物品工具：纯函数或仅依赖 state 的查询，供 Engine 与各 action 模块使用。
 * 不执行 Engine.run / Engine.log，仅做 slot 解析与数量统计。
 * 品质值为 1～6 档，同档位可堆叠。
 */
const InventoryUtils = {
    QUALITY_TIER_MIN: 1,
    QUALITY_TIER_MAX: 6,

    clampQuality(tier) {
        const n = Math.floor(Number(tier));
        if (isNaN(n)) return this.QUALITY_TIER_MIN;
        return Math.max(this.QUALITY_TIER_MIN, Math.min(this.QUALITY_TIER_MAX, n));
    },

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
    },

    findSlotByBaseIdAndQuality(inventory, inventoryQuality, baseItemId, quality) {
        if (!inventory) return null;
        const q = InventoryUtils.clampQuality(quality == null ? 1 : quality);
        for (const k of Object.keys(inventory)) {
            if (InventoryUtils.getBaseItemId(k) !== baseItemId) continue;
            const slotQ = InventoryUtils.clampQuality((inventoryQuality && inventoryQuality[k]) != null ? inventoryQuality[k] : 1);
            if (slotQ === q && (inventory[k] || 0) > 0) return k;
        }
        return null;
    },

    countItemInInventoryUnlocked(baseItemId, inventory, lockedSet) {
        if (!inventory) return 0;
        const locked = lockedSet && typeof lockedSet === 'object' ? lockedSet : {};
        let total = 0;
        for (const key of Object.keys(inventory)) {
            if (locked[key]) continue;
            if (InventoryUtils.getBaseItemId(key) === baseItemId)
                total += (inventory[key] || 0) || 1;
        }
        return total;
    },

    findSlotKeyForUnlocked(baseItemId, inventory, lockedSet) {
        if (!inventory) return null;
        const locked = lockedSet && typeof lockedSet === 'object' ? lockedSet : {};
        for (const k of Object.keys(inventory)) {
            if (locked[k]) continue;
            if (InventoryUtils.getBaseItemId(k) === baseItemId) {
                const v = inventory[k];
                if ((typeof v === 'number' && v > 0) || v === 1) return k;
            }
        }
        return null;
    },

    /** 在未锁定格子中找第一个「baseId 在 allowedBaseIds 内」且数量>0 的格子 key */
    findSlotKeyForUnlockedWithTag(allowedBaseIds, inventory, lockedSet) {
        if (!inventory || !allowedBaseIds || allowedBaseIds.length === 0) return null;
        const set = new Set(allowedBaseIds);
        const locked = lockedSet && typeof lockedSet === 'object' ? lockedSet : {};
        for (const k of Object.keys(inventory)) {
            if (locked[k]) continue;
            const baseId = InventoryUtils.getBaseItemId(k);
            if (!set.has(baseId)) continue;
            const v = inventory[k];
            if ((typeof v === 'number' && v > 0) || v === 1) return k;
        }
        return null;
    },

    findSlotKeyForUnlockedWithQuality(baseItemId, inventory, lockedSet, inventoryQuality, quality) {
        if (!inventory) return null;
        const locked = lockedSet && typeof lockedSet === 'object' ? lockedSet : {};
        const q = InventoryUtils.clampQuality(quality == null ? 1 : quality);
        for (const k of Object.keys(inventory)) {
            if (locked[k]) continue;
            if (InventoryUtils.getBaseItemId(k) !== baseItemId) continue;
            const slotQ = InventoryUtils.clampQuality((inventoryQuality && inventoryQuality[k]) != null ? inventoryQuality[k] : 1);
            if (slotQ !== q) continue;
            const v = inventory[k];
            if ((typeof v === 'number' && v > 0) || v === 1) return k;
        }
        return null;
    }
};
