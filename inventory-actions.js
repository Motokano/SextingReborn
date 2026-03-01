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
        const invQuality = Engine.state.inventory_quality || {};
        const sizeLimit = Engine.state.inventory_size || 12;
        const hasBackpack = Engine.state.has_backpack === true;
        const quality = InventoryUtils.clampQuality(c.quality != null ? c.quality : (item.quality != null ? item.quality : 1));
        const count = c.count || 1;
        const unitWeight = item.weight || 0;
        const overflowToGround = c.overflow_to_ground === true;

        // 计算最多能拿多少（重量、格子、堆叠）
        let maxByWeight = count;
        if (unitWeight > 0 && Engine.state.max_weight != null) {
            const spare = Engine.state.max_weight - (Engine.state.current_weight || 0);
            maxByWeight = Math.max(0, Math.floor(spare / unitWeight));
        }
        let canAdd = Math.min(count, maxByWeight);
        if (canAdd <= 0 && !overflowToGround) {
            Engine.log("太重了，拿不动。");
            return;
        }

        if (hasBackpack) {
            const stackLimit = item.stack_limit || 1;
            const existingSlot = InventoryUtils.findSlotByBaseIdAndQuality(inv, invQuality, baseId, quality);
            let stackSpace = 0;
            if (existingSlot) {
                const currentCount = inv[existingSlot] || 0;
                stackSpace = Math.max(0, stackLimit - currentCount);
            }
            const newSlots = Math.max(0, sizeLimit - Object.keys(inv).length);
            const canAddBySpace = Math.min(count, stackSpace + newSlots * stackLimit);
            canAdd = Math.min(canAdd, canAddBySpace);
        } else {
            const freeSlots = Math.max(0, sizeLimit - Object.keys(inv).length);
            canAdd = Math.min(canAdd, freeSlots);
        }

        if (canAdd <= 0 && !overflowToGround) {
            Engine.log(hasBackpack ? "背包格子已满。" : "身上拿不下了。");
            return;
        }
        if (canAdd <= 0 && overflowToGround) { /* 全部丢到地上，下面处理 */ }

        // 往背包里加 canAdd 个
        if (canAdd > 0) {
            if (hasBackpack) {
                const stackLimit = item.stack_limit || 1;
                const existingSlot = InventoryUtils.findSlotByBaseIdAndQuality(inv, invQuality, baseId, quality);
                let left = canAdd;
                if (existingSlot && left > 0) {
                    const currentCount = inv[existingSlot] || 0;
                    const add = Math.min(left, Math.max(0, stackLimit - currentCount));
                    if (add > 0) {
                        inv[existingSlot] = currentCount + add;
                        Engine.state.current_weight += unitWeight * add;
                        left -= add;
                    }
                }
                while (left > 0 && Object.keys(inv).length < sizeLimit) {
                    const slotKey = InventoryUtils.getNextSlotKey(inv, baseId);
                    const toAdd = Math.min(left, stackLimit);
                    inv[slotKey] = toAdd;
                    invQuality[slotKey] = quality;
                    Engine.state.inventory_quality = invQuality;
                    Engine.state.current_weight += unitWeight * toAdd;
                    left -= toAdd;
                }
            } else {
                for (let i = 0; i < canAdd && Object.keys(inv).length < sizeLimit; i++) {
                    const slotKey = InventoryUtils.getNextSlotKey(inv, baseId);
                    inv[slotKey] = 1;
                    invQuality[slotKey] = quality;
                    Engine.state.current_weight += unitWeight;
                }
                Engine.state.inventory_quality = invQuality;
            }
            Engine.log(`你得到了 ${item.sn}${canAdd > 1 ? ' x' + canAdd : ''}。`);
        }

        const overflow = count - canAdd;
        if (overflow <= 0) return;
        if (!overflowToGround) {
            if (overflow > 0 && canAdd === 0) Engine.log("太重了，拿不动。");
            return;
        }
        // 拿不下的丢到当前格地面
        const gridCell = Engine.cur && Engine.cur.grid && Engine.pIdx != null && Engine.cur.grid[Engine.pIdx];
        if (!gridCell || gridCell.blocking) return;
        const ref = gridCell.object_id ? (Engine.db.objects && Engine.db.objects[gridCell.object_id]) : null;
        if (ref && ref.blocking) return;
        const ground = gridCell.groundInventory || (gridCell.groundInventory = {});
        const totalOnGround = Object.values(ground).reduce((a, n) => a + n, 0);
        const groundLimit = (typeof Engine.GROUND_SLOTS === 'number' ? Engine.GROUND_SLOTS : 8);
        const toGround = Math.min(overflow, Math.max(0, groundLimit - totalOnGround));
        if (toGround > 0) {
            ground[baseId] = (ground[baseId] || 0) + toGround;
            Engine.log("拿不下的掉在了地上。");
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
        if (currentCount <= 0) {
            delete inv[c.item_id];
            if (Engine.state.inventory_quality) delete Engine.state.inventory_quality[c.item_id];
        } else inv[c.item_id] = currentCount;
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
