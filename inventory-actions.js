/**
 * 背包/物品相关 run 命令：add/remove/drop/ground/container。依赖 Engine, InventoryUtils。
 * 通过 RunHandlers 注册，由 main.js 的 Engine.run 调用。
 */
const InventoryActions = {
    add_to_inventory(c) {
        const baseId = (typeof InventoryUtils !== 'undefined' ? InventoryUtils.getBaseItemId(c.item_id) : null) || c.item_id;
        const item = (Engine.db.objects && Engine.db.objects[baseId]) || (Engine.db.items && Engine.db.items[baseId]);
        if (!item) return;

        const inv = Engine.state.inventory;
        const sizeLimit = Engine.state.inventory_size || 12;
        const hasBackpack = Engine.state.has_backpack === true;

        if (hasBackpack) {
            const count = c.count || 1;
            const weight = (item.weight || 0) * count;
            if (Engine.state.current_weight + weight > Engine.state.max_weight) {
                Engine.log("太重了，拿不动。");
                return;
            }
            const stackLimit = item.stack_limit || 1;
            const currentCount = inv[baseId] || 0;
            if (currentCount >= stackLimit) {
                Engine.log(`${item.sn}在你的背包里已经堆叠满了。`);
                return;
            }
            if (Object.keys(inv).length >= sizeLimit && !inv[baseId]) {
                Engine.log("背包格子已满。");
                return;
            }
            inv[baseId] = currentCount + count;
            Engine.state.current_weight += weight;
            Engine.log(`你得到了 ${item.sn} x${count}。`);
        } else {
            const toAdd = c.count || 1;
            const weight = (item.weight || 0) * toAdd;
            if (Engine.state.current_weight + weight > Engine.state.max_weight) {
                Engine.log("太重了，拿不动。");
                return;
            }
            for (let i = 0; i < toAdd; i++) {
                if (Object.keys(inv).length >= sizeLimit) {
                    Engine.log("身上拿不下了。");
                    break;
                }
                const slotKey = InventoryUtils.getNextSlotKey(inv, baseId);
                inv[slotKey] = 1;
                Engine.state.current_weight += (item.weight || 0);
            }
            Engine.log(`你得到了 ${item.sn}${toAdd > 1 ? ' x' + toAdd : ''}。`);
        }
    },

    remove_from_inventory(c) {
        const toRemove = c.count || 1;
        const inv = Engine.state.inventory;
        let currentCount = inv[c.item_id] || 0;
        if (currentCount <= 0) return;
        const baseId = InventoryUtils.getBaseItemId(c.item_id);
        const item = (Engine.db.objects && Engine.db.objects[baseId]) || (Engine.db.items && Engine.db.items[baseId]);
        const actual = Math.min(toRemove, currentCount);
        currentCount -= actual;
        if (currentCount <= 0) delete inv[c.item_id];
        else inv[c.item_id] = currentCount;
        if (item && item.weight) Engine.state.current_weight = Math.max(0, Engine.state.current_weight - item.weight * actual);
    },

    take_item_from_ground(c) {
        const gridCell = Engine.cur.grid[Engine.pIdx];
        if (!gridCell) return;
        if (c.item_id) {
            const ground = gridCell.groundInventory || {};
            if (ground[c.item_id] && ground[c.item_id] > 0) {
                Engine.run([{ type: 'add_to_inventory', item_id: c.item_id, count: 1 }]);
                ground[c.item_id]--;
                if (ground[c.item_id] <= 0) delete ground[c.item_id];
            }
        } else if (gridCell.object_id) {
            const oid = gridCell.object_id;
            Engine.run([{ type: 'add_to_inventory', item_id: oid, count: 1 }]);
            delete gridCell.object_id;
            if (!gridCell.groundInventory && !gridCell.npc_id && !gridCell.acts && !gridCell.action_ids && !gridCell.onStep) gridCell.type = 'null';
        }
    },

    drop_to_ground(c) {
        const gridCell = Engine.cur.grid[Engine.pIdx];
        if (!gridCell) return;
        const ref = gridCell.object_id ? Engine.db.objects[gridCell.object_id] : null;
        if (gridCell.blocking || (ref && ref.blocking)) {
            Engine.log("这里无法放置物品。");
            return;
        }
        const count = c.count || 1;
        const have = Engine.state.inventory[c.item_id];
        if (!have || have < count) return;
        const baseId = InventoryUtils.getBaseItemId(c.item_id);
        const ground = gridCell.groundInventory || (gridCell.groundInventory = {});
        const total = Object.values(ground).reduce((a, n) => a + n, 0);
        if (total + count > Engine.GROUND_SLOTS) {
            Engine.log("这块地上已经放不下更多东西了。");
            return;
        }
        Engine.run([{ type: 'remove_from_inventory', item_id: c.item_id, count }]);
        ground[baseId] = (ground[baseId] || 0) + count;
        const item = Engine.db.objects[baseId] || Engine.db.items[baseId];
        if (item) Engine.log(`你把 ${item.sn} 放到了地上。`);
    },

    move_item_to_container(c) {
        const gridIdx = parseInt(c.container_id.split('_')[1], 10);
        if (isNaN(gridIdx)) return;
        const container = Engine.cur.grid[gridIdx];
        const baseId = InventoryUtils.getBaseItemId(c.item_id);
        const itemDef = (Engine.db.objects && Engine.db.objects[baseId]) || (Engine.db.items && Engine.db.items[baseId]);
        if (!container || !itemDef || !Engine.state.inventory[c.item_id]) return;

        const containerDef = Engine.db.objects[container.object_id];
        const currentContainerCount = Object.keys(container.inventory).length;
        if (currentContainerCount >= containerDef.capacity) {
            Engine.log(`${containerDef.sn}已经满了。`);
            return;
        }
        Engine.run([{ type: 'remove_from_inventory', item_id: c.item_id, count: 1 }]);
        container.inventory[baseId] = (container.inventory[baseId] || 0) + 1;
        Engine.log(`你将一个${itemDef.sn}放入了${containerDef.sn}。`);
    },

    move_item_from_container(c) {
        const gridIdx = parseInt(c.container_id.split('_')[1], 10);
        if (isNaN(gridIdx)) return;
        const container = Engine.cur.grid[gridIdx];
        const itemDef = (Engine.db.objects && Engine.db.objects[c.item_id]) || (Engine.db.items && Engine.db.items[c.item_id]);
        if (!container || !itemDef || !container.inventory[c.item_id]) return;

        Engine.run([{ type: 'add_to_inventory', item_id: c.item_id, count: 1 }]);
        container.inventory[c.item_id]--;
        if (container.inventory[c.item_id] <= 0) delete container.inventory[c.item_id];
    }
};
