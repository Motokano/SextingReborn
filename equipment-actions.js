/**
 * 装备槽相关 run 命令：equip_item / unequip_item / put_into_belt_slot / take_from_belt_slot。
 * 12 槽位：头饰、护甲、左手、右手、腰带、左脚、右脚、左耳环、右耳环、项链、左手戒指、右手戒指。
 * 腰带快捷栏每格存物品本身（移入）；卸下腰带时格内物品回背包。
 */
const EQUIPMENT_SLOT_NAMES = ["头饰", "护甲", "左手", "右手", "腰带", "左脚", "右脚", "左耳环", "右耳环", "项链", "左手戒指", "右手戒指"];

const EquipmentActions = {

    _ensureSlots() {
        if (!Engine.state.equipment_slots) {
            Engine.state.equipment_slots = {};
            EQUIPMENT_SLOT_NAMES.forEach(s => { Engine.state.equipment_slots[s] = null; });
        }
        if (!Array.isArray(Engine.state.belt_quick_contents)) Engine.state.belt_quick_contents = [];
    },

    _getBeltQuickSlots() {
        const beltKey = Engine.state.equipment_slots && Engine.state.equipment_slots["腰带"];
        if (!beltKey) return 0;
        const baseId = (typeof InventoryUtils !== 'undefined' ? InventoryUtils.getBaseItemId(beltKey) : null) || beltKey;
        const item = (Engine.db.objects && Engine.db.objects[baseId]) || (Engine.db.items && Engine.db.items[baseId]);
        return Math.max(0, parseInt(item && item.quick_slots, 10) || 0);
    },

    _resizeBeltContents(newLen) {
        const arr = Engine.state.belt_quick_contents || [];
        const cap = newLen;
        if (arr.length <= cap) {
            while (arr.length < cap) arr.push(null);
            Engine.state.belt_quick_contents = arr;
            return;
        }
        for (let i = cap; i < arr.length; i++) {
            if (arr[i]) EquipmentActions._returnBeltSlotToInventory(i);
        }
        Engine.state.belt_quick_contents = arr.slice(0, cap);
    },

    _returnBeltSlotToInventory(beltIndex) {
        const arr = Engine.state.belt_quick_contents || [];
        const entry = arr[beltIndex];
        if (!entry || !entry.baseId) return;
        if (Engine.runHandlers.add_to_inventory) {
            Engine.runHandlers.add_to_inventory({
                item_id: entry.baseId,
                count: entry.count || 1,
                quality: entry.quality != null ? entry.quality : 1,
                overflow_to_ground: true
            });
        }
        arr[beltIndex] = null;
    },

    _returnAllBeltToInventory() {
        const arr = Engine.state.belt_quick_contents || [];
        for (let i = 0; i < arr.length; i++) {
            if (arr[i]) EquipmentActions._returnBeltSlotToInventory(i);
        }
        Engine.state.belt_quick_contents = [];
    },

    equip_item(c) {
        const slotKey = c.item_slot_key;
        if (!slotKey) return;

        const inv = Engine.state.inventory || {};
        if (inv[slotKey] == null || inv[slotKey] <= 0) {
            Engine.log("背包中没有这件物品。");
            return;
        }

        const baseId = (typeof InventoryUtils !== 'undefined' ? InventoryUtils.getBaseItemId(slotKey) : null) || slotKey;
        const item = (Engine.db.objects && Engine.db.objects[baseId]) || (Engine.db.items && Engine.db.items[baseId]);
        if (!item || !item.equipment_slot) {
            Engine.log("这件物品无法装备。");
            return;
        }

        EquipmentActions._ensureSlots();
        const equipSlot = item.equipment_slot;
        if (!EQUIPMENT_SLOT_NAMES.includes(equipSlot)) {
            Engine.log("未知的装备槽位：" + equipSlot);
            return;
        }

        const current = Engine.state.equipment_slots[equipSlot];
        if (current) {
            const curBaseId = (typeof InventoryUtils !== 'undefined' ? InventoryUtils.getBaseItemId(current) : null) || current;
            const curItem = (Engine.db.objects && Engine.db.objects[curBaseId]) || (Engine.db.items && Engine.db.items[curBaseId]);
            Engine.log("已卸下" + (curItem ? curItem.sn : current) + "。");
            Engine.state.equipment_slots[equipSlot] = null;
            if (equipSlot === "腰带") EquipmentActions._returnAllBeltToInventory();
        }

        Engine.state.equipment_slots[equipSlot] = slotKey;
        Engine.log("你装备了" + item.sn + "。");

        if (equipSlot === "腰带") {
            const quickSlots = item.quick_slots != null ? Math.max(0, parseInt(item.quick_slots, 10)) : 0;
            EquipmentActions._resizeBeltContents(quickSlots);
        }
    },

    unequip_item(c) {
        const equipSlot = c.equipment_slot;
        if (!equipSlot) return;
        EquipmentActions._ensureSlots();

        const current = Engine.state.equipment_slots[equipSlot];
        if (!current) {
            Engine.log(equipSlot + "槽位上没有装备。");
            return;
        }

        if (equipSlot === "腰带") EquipmentActions._returnAllBeltToInventory();
        const baseId = (typeof InventoryUtils !== 'undefined' ? InventoryUtils.getBaseItemId(current) : null) || current;
        const item = (Engine.db.objects && Engine.db.objects[baseId]) || (Engine.db.items && Engine.db.items[baseId]);
        Engine.state.equipment_slots[equipSlot] = null;
        Engine.log("你卸下了" + (item ? item.sn : current) + "。");
    },

    put_into_belt_slot(c) {
        const beltIndex = c.belt_index;
        const itemSlotKey = c.item_slot_key;
        const count = c.count != null ? Math.max(1, parseInt(c.count, 10)) : 1;
        if (beltIndex == null || beltIndex < 0 || !itemSlotKey) return;

        const beltKey = Engine.state.equipment_slots && Engine.state.equipment_slots["腰带"];
        if (!beltKey) {
            Engine.log("未装备腰带，无法放入快捷栏。");
            return;
        }
        const inv = Engine.state.inventory || {};
        const have = inv[itemSlotKey];
        if (have == null || have < count) {
            Engine.log("背包中数量不足。");
            return;
        }
        const baseId = (typeof InventoryUtils !== 'undefined' ? InventoryUtils.getBaseItemId(itemSlotKey) : null) || itemSlotKey;
        const item = (Engine.db.objects && Engine.db.objects[baseId]) || (Engine.db.items && Engine.db.items[baseId]);
        if (!item) return;

        const arr = Engine.state.belt_quick_contents || [];
        const cap = EquipmentActions._getBeltQuickSlots();
        if (beltIndex >= cap) return;
        while (arr.length <= beltIndex) arr.push(null);
        if (arr[beltIndex] != null) {
            Engine.log("该快捷格已有物品，请先取出。");
            return;
        }

        const quality = (Engine.state.inventory_quality && Engine.state.inventory_quality[itemSlotKey]) != null
            ? Engine.state.inventory_quality[itemSlotKey] : (item.quality != null ? item.quality : 1);
        inv[itemSlotKey] = have - count;
        if (inv[itemSlotKey] <= 0) {
            delete inv[itemSlotKey];
            if (Engine.state.inventory_quality) delete Engine.state.inventory_quality[itemSlotKey];
        }
        if (Engine.state.current_weight != null && item.weight) Engine.state.current_weight -= item.weight * count;
        arr[beltIndex] = { baseId: baseId, count: count, quality: quality };
        Engine.state.belt_quick_contents = arr;
        Engine.log("已将" + (item.sn || baseId) + (count > 1 ? " x" + count : "") + "放入腰带快捷栏。");
    },

    take_from_belt_slot(c) {
        const beltIndex = c.belt_index;
        if (beltIndex == null || beltIndex < 0) return;

        const arr = Engine.state.belt_quick_contents || [];
        const entry = arr[beltIndex];
        if (!entry || !entry.baseId) {
            Engine.log("该格为空。");
            return;
        }
        if (Engine.runHandlers.add_to_inventory) {
            Engine.runHandlers.add_to_inventory({
                item_id: entry.baseId,
                count: entry.count || 1,
                quality: entry.quality != null ? entry.quality : 1,
                overflow_to_ground: true
            });
        }
        arr[beltIndex] = null;
        Engine.state.belt_quick_contents = arr;
    }
};
