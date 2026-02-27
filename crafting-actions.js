/**
 * 制作相关 run 命令：craft。依赖 Engine, InventoryUtils。
 */
const CraftingActions = {
    craft(c) {
        const recipeId = c.recipe_id;
        const recipes = Engine.db.recipes || {};
        const recipe = recipes[recipeId];
        if (!recipe || !recipe.materials || !recipe.product) return;
        const materials = recipe.materials;
        const product = recipe.product;
        const inv = Engine.state.inventory;
        const productItemId = product.item_id;
        const productCount = product.count || 1;
        const productDef = (Engine.db.objects && Engine.db.objects[productItemId]) || (Engine.db.items && Engine.db.items[productItemId]);
        if (!productDef) return;

        let canCraft = true;
        for (const [matId, need] of Object.entries(materials)) {
            if (InventoryUtils.countItemInInventory(matId, inv) < need) {
                Engine.log("材料不足，无法制作。");
                canCraft = false;
                break;
            }
        }
        if (!canCraft) return;

        let removed = 0;
        for (const [matId, need] of Object.entries(materials)) {
            for (let i = 0; i < need; i++) {
                const key = InventoryUtils.findSlotKeyFor(matId, inv);
                if (!key) {
                    Engine.log("材料不足，无法制作。");
                    return;
                }
                const matDef = (Engine.db.objects && Engine.db.objects[matId]) || (Engine.db.items && Engine.db.items[matId]);
                const n = inv[key];
                if (typeof n === 'number' && n > 1) {
                    inv[key] = n - 1;
                } else {
                    delete inv[key];
                }
                if (matDef && matDef.weight) Engine.state.current_weight = Math.max(0, Engine.state.current_weight - (matDef.weight || 0));
                removed++;
            }
        }
        if (removed < Object.values(materials).reduce((a, b) => a + b, 0)) return;

        Engine.run([{ type: 'add_to_inventory', item_id: productItemId, count: productCount }]);
        Engine.log(`你制作了${productDef.sn}。`);
    }
};
