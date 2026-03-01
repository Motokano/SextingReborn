/**
 * 制作相关 run 命令：craft。依赖 Engine, InventoryUtils。
 * 配方支持 materials（具体物品）与 tag_materials（按标签：带该 tag 的任意物品均可）。
 * 在家时可从仓库取料；被锁定的物品不参与制作。
 */
const CraftingActions = {
    craft(c) {
        const recipeId = c.recipe_id;
        const recipes = Engine.db.recipes || {};
        const recipe = recipes[recipeId];
        if (!recipe || !recipe.product) return;
        const materials = recipe.materials || {};
        const tagMaterials = recipe.tag_materials || {};
        const product = recipe.product;
        const productItemId = product.item_id;
        const productCount = product.count || 1;
        const productDef = (Engine.db.objects && Engine.db.objects[productItemId]) || (Engine.db.items && Engine.db.items[productItemId]);
        if (!productDef) return;

        const playerInv = Engine.state.inventory || {};
        const playerLocked = Engine.state.inventory_locked || {};
        const home = (typeof Engine.getHomeStorage === 'function') ? Engine.getHomeStorage() : null;
        const containerLocked = home && home.id ? ((Engine.state.container_locked || {})[home.id] || {}) : {};

        let canCraft = true;
        for (const [matId, need] of Object.entries(materials)) {
            const have = (typeof Engine.countAvailableMaterial === 'function')
                ? Engine.countAvailableMaterial(matId)
                : InventoryUtils.countItemInInventoryUnlocked(matId, playerInv, playerLocked);
            if (have < need) {
                Engine.log("材料不足，无法制作。");
                canCraft = false;
                break;
            }
        }
        if (canCraft && typeof Engine.countAvailableByTag === 'function') {
            for (const [tag, need] of Object.entries(tagMaterials)) {
                if ((Engine.countAvailableByTag(tag) || 0) < need) {
                    Engine.log("材料不足，无法制作。");
                    canCraft = false;
                    break;
                }
            }
        }
        if (!canCraft) return;

        const removeOneByTag = (tag, needCount) => {
            const ids = (typeof Engine.getItemIdsWithTag === 'function') ? Engine.getItemIdsWithTag(tag) : [];
            let left = needCount;
            while (left > 0) {
                let key = InventoryUtils.findSlotKeyForUnlockedWithTag(ids, playerInv, playerLocked);
                let fromInv = playerInv;
                if (!key && home && home.inventory)
                    key = InventoryUtils.findSlotKeyForUnlockedWithTag(ids, home.inventory, containerLocked), fromInv = home.inventory;
                if (!key) return false;
                const baseId = InventoryUtils.getBaseItemId(key);
                const n = fromInv[key];
                if (typeof n === 'number' && n > 1) fromInv[key] = n - 1;
                else delete fromInv[key];
                if (Engine.state.inventory_quality && fromInv === playerInv) delete Engine.state.inventory_quality[key];
                const obj = (Engine.db.objects && Engine.db.objects[baseId]) || (Engine.db.items && Engine.db.items[baseId]);
                if (obj && obj.weight) Engine.state.current_weight = Math.max(0, (Engine.state.current_weight || 0) - (obj.weight || 0));
                left--;
            }
            return true;
        };

        for (const [matId, need] of Object.entries(materials)) {
            let left = need;
            const matDef = (Engine.db.objects && Engine.db.objects[matId]) || (Engine.db.items && Engine.db.items[matId]);
            while (left > 0) {
                let key = InventoryUtils.findSlotKeyForUnlocked(matId, playerInv, playerLocked);
                if (key) {
                    const n = playerInv[key];
                    if (typeof n === 'number' && n > 1) {
                        playerInv[key] = n - 1;
                    } else {
                        delete playerInv[key];
                        if (Engine.state.inventory_quality) delete Engine.state.inventory_quality[key];
                    }
                    if (matDef && matDef.weight) Engine.state.current_weight = Math.max(0, (Engine.state.current_weight || 0) - (matDef.weight || 0));
                    left--;
                    continue;
                }
                if (home && home.inventory) {
                    key = InventoryUtils.findSlotKeyForUnlocked(matId, home.inventory, containerLocked);
                    if (key) {
                        const n = home.inventory[key];
                        if (typeof n === 'number' && n > 1) {
                            home.inventory[key] = n - 1;
                        } else {
                            delete home.inventory[key];
                        }
                        left--;
                        continue;
                    }
                }
                Engine.log("材料不足，无法制作。");
                return;
            }
        }

        for (const [tag, need] of Object.entries(tagMaterials)) {
            if (!removeOneByTag(tag, need)) {
                Engine.log("材料不足，无法制作。");
                return;
            }
        }

        Engine.run([{ type: 'add_to_inventory', item_id: productItemId, count: productCount }]);
        Engine.log(`你制作了${productDef.sn}。`);
    }
};
