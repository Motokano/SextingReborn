/**
 * 采集类动作：挖矿、伐木、钓鱼、收割、狩猎等命令的具体执行逻辑。
 * 依赖全局 Engine（run, log, getSkillProgress, getMiningBand）。
 * 由 main.js 的 Engine.run 在对应 type 时调用。
 */
function cropIdToSeedId(cropId) {
    if (cropId === 'wheat_ear') return 'wheat_seed';
    return (cropId || '').replace(/_ear$/, '') + '_seed';
}

/** 采集/生活技能品质掷骰：1～1000 级，1 级时最高品质(6)概率 0.01%，1000 级时 15%，线性增长；其余 1～5 档按几何曲线分配（陡峭，多数为 1）。 */
function rollGatherQuality(skillLevel) {
    const L = Math.max(1, Math.min(1000, Math.floor(Number(skillLevel)) || 1));
    const P6 = 0.0001 + (L - 1) / 999 * (0.15 - 0.0001);
    if (Math.random() < P6) return 6;
    const r = 0.35;
    const sum = 1 + r + r * r + r * r * r + r * r * r * r;
    const k = (1 - P6) / sum;
    const P1 = k, P2 = k * r, P3 = k * r * r, P4 = k * r * r * r, P5 = k * r * r * r * r;
    const u = Math.random();
    if (u < P1) return 1;
    if (u < P1 + P2) return 2;
    if (u < P1 + P2 + P3) return 3;
    if (u < P1 + P2 + P3 + P4) return 4;
    return 5;
}

const GameActions = {
    gather_berries(c) {
        const plantId = c.plant_id || 'wild_berry';
        const seedId = c.seed_id || 'wild_berry_seed';
        const bonus = Engine.getLifeBuildingBonus && Engine.getLifeBuildingBonus('survival', 'gathering');
        const yieldMult = bonus ? bonus.yieldMult : 1;
        const expMult = bonus ? bonus.expMult : 1;
        let count = 1;
        if (yieldMult > 1 && Math.random() < (yieldMult - 1)) count = 2;
        Engine.run([{ type: 'add_to_inventory', item_id: plantId, count, overflow_to_ground: true }]);
        if (Math.random() < 0.28) {
            const quality = Math.random() < 0.5 ? 1 : 2;
            Engine.run([{ type: 'add_to_inventory', item_id: seedId, count: 1, quality, overflow_to_ground: true }]);
            Engine.log("你从果丛里还摸出几粒小籽。");
        }
        Engine.run([{ type: 'gain_skill_exp', category: 'survival', skill_id: 'gathering', amount: Math.max(1, Math.floor(5 * expMult)) }]);
    },

    gather_herbs(c) {
        const bonus = Engine.getLifeBuildingBonus && Engine.getLifeBuildingBonus('survival', 'gathering');
        const yieldMult = bonus ? bonus.yieldMult : 1;
        const expMult = bonus ? bonus.expMult : 1;
        let count = 1;
        if (yieldMult > 1 && Math.random() < (yieldMult - 1)) count = 2;
        Engine.run([{ type: 'add_to_inventory', item_id: 'bitter_herb', count, overflow_to_ground: true }]);
        Engine.run([{ type: 'gain_skill_exp', category: 'survival', skill_id: 'gathering', amount: Math.max(1, Math.floor(6 * expMult)) }]);
    },

    mine_ore(c) {
        const mode = c.mode === 'auto' ? 'auto' : 'manual';
        const difficulty = Math.max(1, Math.min(10, parseInt(c.difficulty, 10) || 1));
        const cycles = Math.max(1, parseInt(c.cycles, 10) || 1);

        // 解析矿石来源：命令未带 ore_vein/ore_item_id 时按当前场景与格子物体解析
        let oreVein = c.ore_vein;
        let oreItemId = c.ore_item_id;
        if (!oreVein && !oreItemId && Engine.resolveOreSource && Engine.curId != null) {
            const cell = Engine.cur && Engine.cur.grid && Engine.cur.grid[Engine.pIdx];
            const objectId = cell && cell.object_id;
            const resolved = Engine.resolveOreSource(Engine.curId, objectId);
            oreVein = resolved.ore_vein;
            oreItemId = resolved.ore_item_id;
        }
        if (!oreVein && !oreItemId) oreItemId = 'iron_ore';

        const miningProg = Engine.getSkillProgress('production', 'mining');
        if (!miningProg) {
            Engine.log("你还不懂挖矿要领，难以下手。");
            return;
        }
        const miningLevel = miningProg.level || 1;
        const band = Engine.getMiningBand(miningLevel);
        const isTrivial = difficulty < band;
        const expPerCycle = mode === 'manual' ? 10 : 4;
        let exp = (mode === 'auto' && isTrivial) ? 0 : expPerCycle * cycles;

        let oreCount = 0;
        let stoneCount = 0;
        for (let i = 0; i < cycles; i++) {
            const baseChance = mode === 'manual' ? 0.70 : 0.40;
            const diffPenalty = Math.max(0, difficulty - band) * 0.06;
            const baseChanceClamped = Math.max(0.10, Math.min(0.90, baseChance - diffPenalty));
            const almanacMod = Engine.getAlmanacModifier ? Engine.getAlmanacModifier('mining') : 0;
            const chance = Math.max(0.01, Math.min(0.99, baseChanceClamped * (1 + almanacMod)));
            const gotOre = Math.random() < chance;
            if (gotOre) {
                const extra = (mode === 'manual' && Math.random() < 0.20) ? 2 : 1;
                oreCount += extra;
            } else {
                stoneCount += 1;
            }
        }

        const miningBonus = Engine.getLifeBuildingBonus && Engine.getLifeBuildingBonus('production', 'mining');
        if (miningBonus) {
            oreCount = Math.max(0, Math.floor(oreCount * miningBonus.yieldMult));
            stoneCount = Math.max(0, Math.floor(stoneCount * miningBonus.yieldMult));
            exp = Math.max(0, Math.floor(exp * miningBonus.expMult));
        }

        // 按矿脉权重或单一矿种发放矿石
        if (oreCount > 0) {
            if (oreVein && Object.keys(oreVein).length > 0) {
                const entries = Object.entries(oreVein).filter(([, w]) => (Number(w) || 0) > 0);
                const totalWeight = entries.reduce((s, [, w]) => s + (Number(w) || 0), 0);
                const ids = entries.map(([id]) => id);
                const byId = {};
                for (let n = 0; n < oreCount; n++) {
                    let r = totalWeight > 0 ? Math.random() * totalWeight : 0;
                    let chosen = ids[0];
                    for (const [id, w] of entries) {
                        r -= Number(w) || 0;
                        if (r <= 0) { chosen = id; break; }
                    }
                    byId[chosen] = (byId[chosen] || 0) + 1;
                }
                for (const [id, count] of Object.entries(byId)) {
                    if (count > 0) Engine.run([{ type: 'add_to_inventory', item_id: id, count, overflow_to_ground: true }]);
                }
            } else {
                Engine.run([{ type: 'add_to_inventory', item_id: oreItemId, count: oreCount, overflow_to_ground: true }]);
            }
        }
        if (stoneCount > 0) Engine.run([{ type: 'add_to_inventory', item_id: 'stone', count: stoneCount, overflow_to_ground: true }]);
        if (oreCount > 0 && stoneCount > 0) Engine.log("你敲下碎石，间或挖到几块像样的矿石。");
        else if (oreCount > 0) Engine.log("你从碎石中挖出几块矿石。");
        else Engine.log("你挖了半天，只敲下些废石。");

        if (exp > 0) Engine.run([{ type: 'gain_skill_exp', category: 'production', skill_id: 'mining', amount: exp }]);
        else if (mode === 'auto' && isTrivial) Engine.log("这种程度的矿石对你而言太过简单，难以再有精进。");
    },

    chop_wood(c) {
        const mode = c.mode === 'auto' ? 'auto' : 'manual';
        const difficulty = Math.max(1, Math.min(10, parseInt(c.difficulty, 10) || 1));
        const woodItemId = c.wood_item_id || 'pine_log';
        const cycles = Math.max(1, parseInt(c.cycles, 10) || 1);

        const loggingProg = Engine.getSkillProgress('production', 'logging');
        if (!loggingProg) {
            Engine.log("你还不懂如何下斧，只能笨拙地敲在树上。");
            return;
        }
        const loggingLevel = loggingProg.level || 1;
        const band = Engine.getMiningBand(loggingLevel);
        const isTrivial = difficulty < band;
        const expPerCycle = mode === 'manual' ? 9 : 4;
        let exp = (mode === 'auto' && isTrivial) ? 0 : expPerCycle * cycles;

        let woodCount = 0;
        for (let i = 0; i < cycles; i++) {
            const baseChance = mode === 'manual' ? 0.75 : 0.45;
            const diffPenalty = Math.max(0, difficulty - band) * 0.06;
            const baseChanceClamped = Math.max(0.10, Math.min(0.95, baseChance - diffPenalty));
            const almanacMod = Engine.getAlmanacModifier ? Engine.getAlmanacModifier('logging') : 0;
            const chance = Math.max(0.01, Math.min(0.99, baseChanceClamped * (1 + almanacMod)));
            const gotWood = Math.random() < chance;
            if (gotWood) {
                woodCount += (mode === 'manual' && Math.random() < 0.25) ? 2 : 1;
            }
        }

        const loggingBonus = Engine.getLifeBuildingBonus && Engine.getLifeBuildingBonus('production', 'logging');
        if (loggingBonus) {
            woodCount = Math.max(0, Math.floor(woodCount * loggingBonus.yieldMult));
            exp = Math.max(0, Math.floor(exp * loggingBonus.expMult));
        }
        if (woodCount > 0) {
            for (let i = 0; i < woodCount; i++) {
                const quality = typeof rollGatherQuality === 'function' ? rollGatherQuality(loggingLevel) : 1;
                Engine.run([{ type: 'add_to_inventory', item_id: woodItemId, count: 1, quality, overflow_to_ground: true }]);
            }
            Engine.log("你把树干处理成了几截还能用的木料。");
        }
        else Engine.log("你砍了半天，不是砍歪就是卡斧，几乎没弄出像样的木料。");

        if (exp > 0) Engine.run([{ type: 'gain_skill_exp', category: 'production', skill_id: 'logging', amount: exp }]);
        else if (mode === 'auto' && isTrivial) Engine.log("这种程度的树对你而言太过简单，难以再有精进。");
    },

    catch_fish(c) {
        const mode = c.mode === 'auto' ? 'auto' : 'manual';
        const manualResult = c.manual_result;
        const difficulty = Math.max(1, Math.min(10, parseInt(c.difficulty, 10) || 1));
        const fishItemId = c.fish_item_id || 'dull_bass';
        const cycles = Math.max(1, parseInt(c.cycles, 10) || 1);

        const fishingProg = Engine.getSkillProgress('survival', 'fishing');
        if (!fishingProg) {
            Engine.log("你还不会钓鱼，干坐着也等不到鱼。");
            return;
        }
        const lv = fishingProg.level || 1;
        const band = Engine.getMiningBand(lv);
        const isTrivial = difficulty < band;
        let expPerCycle = mode === 'manual' ? 8 : 4;
        let exp = (mode === 'auto' && isTrivial) ? 0 : expPerCycle * cycles;

        let fishCount = 0;
        let baseChance = mode === 'manual' ? 0.70 : 0.40;
        const diffPenalty = Math.max(0, difficulty - band) * 0.05;

        if (mode === 'manual' && manualResult === 'perfect') {
            baseChance = 0.95;
            expPerCycle = 18;
            exp = expPerCycle * cycles;
        } else if (mode === 'manual' && manualResult === 'late') {
            baseChance = 0.45;
            expPerCycle = 4;
            exp = expPerCycle * cycles;
        } else if (mode === 'manual' && (manualResult === 'early' || manualResult === 'miss')) {
            baseChance = 0.15;
            expPerCycle = 2;
            exp = expPerCycle * cycles;
        }

        for (let i = 0; i < cycles; i++) {
            const baseChanceClamped = Math.max(0.05, Math.min(0.98, baseChance - diffPenalty));
            const almanacMod = Engine.getAlmanacModifier ? Engine.getAlmanacModifier('fishing') : 0;
            const chance = Math.max(0.01, Math.min(0.99, baseChanceClamped * (1 + almanacMod)));
            if (Math.random() < chance) {
                fishCount += (mode === 'manual' && manualResult === 'perfect' && Math.random() < 0.5) ? 2 : 1;
            }
        }

        const fishingBonus = Engine.getLifeBuildingBonus && Engine.getLifeBuildingBonus('survival', 'fishing');
        if (fishingBonus) {
            fishCount = Math.max(0, Math.floor(fishCount * fishingBonus.yieldMult));
            exp = Math.max(0, Math.floor(exp * fishingBonus.expMult));
        }
        if (fishCount > 0) {
            for (let i = 0; i < fishCount; i++) {
                const quality = typeof rollGatherQuality === 'function' ? rollGatherQuality(lv) : 1;
                Engine.run([{ type: 'add_to_inventory', item_id: fishItemId, count: 1, quality, overflow_to_ground: true }]);
            }
        }
        if (fishCount > 0) {
            if (manualResult === 'perfect') Engine.log("你及时提竿，钓到了好鱼！");
            else Engine.log("你钓到了鱼。");
        } else {
            if (manualResult === 'early') Engine.log("提竿太早，鱼还没咬钩，一无所获。");
            else if (manualResult === 'late') Engine.log("提竿慢了，鱼已脱钩。");
            else Engine.log("等了半天，没有鱼上钩。");
        }

        if (exp > 0) Engine.run([{ type: 'gain_skill_exp', category: 'survival', skill_id: 'fishing', amount: exp }]);
        else if (mode === 'auto' && isTrivial) Engine.log("这片水面对你来说太过简单，难以再有精进。");
    },

    harvest_crop(c) {
        const difficulty = Math.max(1, Math.min(10, parseInt(c.difficulty, 10) || 1));
        const cropItemId = c.crop_item_id || 'wheat_ear';

        const farmingProg = Engine.getSkillProgress('production', 'farming');
        if (!farmingProg) {
            Engine.log("你还不会辨认熟成的作物，无从下手。");
            return;
        }
        const lv = farmingProg.level || 1;
        const band = Engine.getMiningBand(lv);
        const baseChance = 0.75 - Math.max(0, difficulty - band) * 0.05;
        const baseChanceClamped = Math.max(0.15, Math.min(0.95, baseChance));
        const almanacMod = Engine.getAlmanacModifier ? Engine.getAlmanacModifier('farming') : 0;
        const chance = Math.max(0.01, Math.min(0.99, baseChanceClamped * (1 + almanacMod)));
        const count = Math.random() < chance ? (Math.random() < 0.3 ? 2 : 1) : 0;

        if (count > 0) Engine.run([{ type: 'add_to_inventory', item_id: cropItemId, count, overflow_to_ground: true }]);
        if (count > 0) Engine.log("你收割到一些作物。");
        else Engine.log("这一片还没熟透，或已被收过，所获不多。");

        if (count > 0) Engine.run([{ type: 'gain_skill_exp', category: 'production', skill_id: 'farming', amount: 6 }]);
    },

    hunt_game(c) {
        const mode = c.mode === 'auto' ? 'auto' : 'manual';
        const difficulty = Math.max(1, Math.min(10, parseInt(c.difficulty, 10) || 1));
        const cycles = Math.max(1, parseInt(c.cycles, 10) || 1);

        const huntingProg = Engine.getSkillProgress('survival', 'hunting');
        if (!huntingProg) {
            Engine.log("你还不会辨踪与下套，乱转也难有收获。");
            return;
        }
        const lv = huntingProg.level || 1;
        const band = Engine.getMiningBand(lv);
        const isTrivial = difficulty < band;
        const expPerCycle = mode === 'manual' ? 10 : 4;
        let exp = (mode === 'auto' && isTrivial) ? 0 : expPerCycle * cycles;

        const MEAT_IDS = ['raw_meat', 'bird_meat', 'rabbit_meat'];
        const BONE_IDS = ['bone', 'bird_bone', 'small_bone'];
        let meat = 0, hideCount = 0, boneCount = 0;
        for (let i = 0; i < cycles; i++) {
            const baseChance = mode === 'manual' ? 0.65 : 0.35;
            const diffPenalty = Math.max(0, difficulty - band) * 0.06;
            const baseChanceClamped = Math.max(0.08, Math.min(0.85, baseChance - diffPenalty));
            const almanacMod = Engine.getAlmanacModifier ? Engine.getAlmanacModifier('hunting') : 0;
            const chance = Math.max(0.01, Math.min(0.99, baseChanceClamped * (1 + almanacMod)));
            if (Math.random() < chance) {
                meat += (mode === 'manual' && Math.random() < 0.25) ? 2 : 1;
                if (Math.random() < 0.6) hideCount += 1;
                if (Math.random() < 0.5) boneCount += 1;
            }
        }

        const huntingBonus = Engine.getLifeBuildingBonus && Engine.getLifeBuildingBonus('survival', 'hunting');
        if (huntingBonus) {
            meat = Math.max(0, Math.floor(meat * huntingBonus.yieldMult));
            hideCount = Math.max(0, Math.floor(hideCount * huntingBonus.yieldMult));
            boneCount = Math.max(0, Math.floor(boneCount * huntingBonus.yieldMult));
            exp = Math.max(0, Math.floor(exp * huntingBonus.expMult));
        }
        const meatByType = {};
        for (let m = 0; m < meat; m++) {
            const id = MEAT_IDS[Math.floor(Math.random() * MEAT_IDS.length)];
            meatByType[id] = (meatByType[id] || 0) + 1;
        }
        const boneByType = {};
        for (let b = 0; b < boneCount; b++) {
            const id = BONE_IDS[Math.floor(Math.random() * BONE_IDS.length)];
            boneByType[id] = (boneByType[id] || 0) + 1;
        }
        for (const [id, count] of Object.entries(meatByType)) Engine.run([{ type: 'add_to_inventory', item_id: id, count, overflow_to_ground: true }]);
        if (hideCount > 0) Engine.run([{ type: 'add_to_inventory', item_id: 'hide', count: hideCount, overflow_to_ground: true }]);
        for (const [id, count] of Object.entries(boneByType)) Engine.run([{ type: 'add_to_inventory', item_id: id, count, overflow_to_ground: true }]);

        if (meat > 0 || hideCount > 0 || boneCount > 0) Engine.log("你从猎物身上取得了兽肉与皮骨。");
        else Engine.log("这一趟没有碰上合适的猎物。");

        if (exp > 0) Engine.run([{ type: 'gain_skill_exp', category: 'survival', skill_id: 'hunting', amount: exp }]);
        else if (mode === 'auto' && isTrivial) Engine.log("这里的猎物对你来说太过简单，难以再有精进。");
    },

    designate_farmland() {
        if (Engine.curId !== 'home') return;
        const list = Engine.state.home_farmland || [];
        if (list.length >= 4) {
            Engine.log("家里最多只能开辟四块农田。");
            return;
        }
        const idx = Engine.pIdx;
        if (list.includes(idx)) {
            Engine.log("这里已经是农田了。");
            return;
        }
        const c = Engine.cur.grid[idx];
        if (c.object_id || c.npc_id || (c.sn && c.sn !== '')) {
            Engine.log("此处已有东西，无法开辟农田。");
            return;
        }
        list.push(idx);
        Engine.state.home_farmland = list;
        c.farmland = true;
        Engine.log("你在此处开辟了一块农田。");
        Engine.render();
    },

    remove_farmland() {
        if (Engine.curId !== 'home') return;
        const list = Engine.state.home_farmland || [];
        const idx = Engine.pIdx;
        if (!list.includes(idx)) {
            Engine.log("这里不是农田，无需撤走。");
            return;
        }
        const c = Engine.cur.grid[idx];
        Engine.state.home_farmland = list.filter(i => i !== idx);
        delete c.farmland;
        const crops = Engine.state.home_crops || {};
        const key = String(idx);
        if (crops[key]) delete crops[key];
        Engine.state.home_crops = crops;
        Engine.log("你撤走了此处的农田。");
        Engine.render();
    },

    sow_home_crop(c) {
        if (Engine.curId !== 'home') return;
        const list = Engine.state.home_farmland || [];
        if (!list.includes(Engine.pIdx)) {
            Engine.log("这里不是农田，无法播种。");
            return;
        }
        const crops = Engine.state.home_crops || {};
        const key = String(Engine.pIdx);
        if (crops[key]) {
            Engine.log("这块田已种有作物。");
            return;
        }
        const farmingProg = Engine.getSkillProgress('production', 'farming');
        if (!farmingProg) {
            Engine.log("你还未学会种植，先看看种植手册吧。");
            return;
        }
        const rawSeedId = (c && c.seed_id) || 'wheat_seed';
        const parts = rawSeedId.indexOf('|') >= 0 ? rawSeedId.split('|') : [rawSeedId, 1];
        const seedId = parts[0];
        const quality = parts.length > 1 ? Math.max(1, Math.min(6, parseInt(parts[1], 10) || 1)) : 1;
        const seedObj = Engine.db.objects && Engine.db.objects[seedId];
        const cropId = (seedObj && seedObj.crop_id) || 'wheat_ear';
        const inv = Engine.state.inventory || {};
        const locked = Engine.state.inventory_locked || {};
        const invQuality = Engine.state.inventory_quality || {};
        let slotKey = typeof InventoryUtils.findSlotKeyForUnlockedWithQuality === 'function'
            ? InventoryUtils.findSlotKeyForUnlockedWithQuality(seedId, inv, locked, invQuality, quality)
            : InventoryUtils.findSlotKeyForUnlocked(seedId, inv, locked);
        let fromInv = inv;
        if (!slotKey && quality === 1 && typeof Engine.getHomeStorage === 'function') {
            const home = Engine.getHomeStorage();
            if (home && home.inventory) {
                const cLocked = (Engine.state.container_locked || {})[home.id] || {};
                slotKey = InventoryUtils.findSlotKeyForUnlocked(seedId, home.inventory, cLocked);
                if (slotKey) fromInv = home.inventory;
            }
        }
        if (!slotKey || !(fromInv[slotKey] >= 1)) {
            Engine.log("你没有可播的种子（或可用的种子已锁定）。");
            return;
        }
        if (fromInv === inv) {
            Engine.run([{ type: 'remove_from_inventory', item_id: slotKey, count: 1 }]);
        } else {
            fromInv[slotKey] = (fromInv[slotKey] || 1) - 1;
            if (fromInv[slotKey] <= 0) delete fromInv[slotKey];
        }
        const day = Engine.state.day_index || 1;
        crops[key] = { crop_id: cropId, planted_at: day };
        Engine.state.home_crops = crops;
        Engine.run([{ type: 'gain_skill_exp', category: 'production', skill_id: 'farming', amount: 4 }]);
        Engine.log("你在田里播下了种子。");
        Engine.render();
    },

    harvest_home_crop(c) {
        if (Engine.curId !== 'home') return;
        const crops = Engine.state.home_crops || {};
        const key = String(Engine.pIdx);
        const info = crops[key];
        if (!info) {
            Engine.log("这块田里没有可收的作物。");
            return;
        }
        const farmingProg = Engine.getSkillProgress('production', 'farming');
        if (!farmingProg) {
            Engine.log("你还不会辨认熟成的作物，无从下手。");
            return;
        }
        const day = Engine.state.day_index || 1;
        const daysGrown = day - (info.planted_at || day);
        const growDays = 1;
        const deadDays = 30;
        let expAmount = 2;
        if (daysGrown >= growDays && daysGrown <= deadDays) {
            const cropId = info.crop_id || 'wheat_ear';
            const count = Math.random() < 0.3 ? 2 : 1;
            Engine.run([{ type: 'add_to_inventory', item_id: cropId, count, overflow_to_ground: true }]);
            Engine.log("你收割了田里的作物，得到成品。");
            expAmount = 8;
        } else if (daysGrown > deadDays) {
            Engine.log("作物早已枯死，你清理了田块，也算长了经验。");
        } else {
            Engine.log("作物还未成熟，你稍作打理，略有所得。");
        }
        Engine.run([{ type: 'gain_skill_exp', category: 'production', skill_id: 'farming', amount: expAmount }]);
        delete crops[key];
        Engine.state.home_crops = crops;
        Engine.render();
    },

    select_seed_home_crop(c) {
        if (Engine.curId !== 'home') return;
        const crops = Engine.state.home_crops || {};
        const key = String(Engine.pIdx);
        const info = crops[key];
        if (!info) {
            Engine.log("这块田里没有可留种的作物。");
            return;
        }
        const farmingProg = Engine.getSkillProgress('production', 'farming');
        if (!farmingProg) {
            Engine.log("你还不会选种，无从下手。");
            return;
        }
        const day = Engine.state.day_index || 1;
        const daysGrown = day - (info.planted_at || day);
        const growDays = 1;
        const deadDays = 30;
        if (daysGrown < growDays || daysGrown > deadDays) {
            Engine.log("只有成熟期内的作物才适合留种。");
            return;
        }
        const cropId = info.crop_id || 'wheat_ear';
        const seedId = cropIdToSeedId(cropId);
        const count = 2 + (Math.random() < 0.5 ? 1 : 0);
        Engine.run([{ type: 'add_to_inventory', item_id: seedId, count, quality: 1, overflow_to_ground: true }]);
        Engine.log("你留出饱满的籽粒作为种子，共 " + count + " 份。");
        Engine.run([{ type: 'gain_skill_exp', category: 'production', skill_id: 'farming', amount: 6 }]);
        delete crops[key];
        Engine.state.home_crops = crops;
        Engine.render();
    },

    refine_seed_home_crop(c) {
        if (Engine.curId !== 'home') return;
        const farmingProg = Engine.getSkillProgress('production', 'farming');
        const refineLevel = 5;
        if (!farmingProg || (farmingProg.level || 1) < refineLevel) {
            Engine.log("你的种植技艺还不足以进行作物选优。");
            return;
        }
        const crops = Engine.state.home_crops || {};
        const key = String(Engine.pIdx);
        const info = crops[key];
        if (!info) {
            Engine.log("这块田里没有可选的作物。");
            return;
        }
        const day = Engine.state.day_index || 1;
        const daysGrown = day - (info.planted_at || day);
        const growDays = 1;
        const deadDays = 30;
        if (daysGrown < growDays || daysGrown > deadDays) {
            Engine.log("只有成熟期内的作物才适合选优留种。");
            return;
        }
        const cropId = info.crop_id || 'wheat_ear';
        const seedId = cropIdToSeedId(cropId);
        const count = 2 + (Math.random() < 0.5 ? 1 : 0);
        const qualityUp = Math.random() < 0.02;
        const quality = qualityUp ? 2 : 1;
        Engine.run([{ type: 'add_to_inventory', item_id: seedId, count, quality, overflow_to_ground: true }]);
        Engine.log(qualityUp ? "你精挑细选，其中竟有品质更优的种子，共 " + count + " 份。" : "你精挑细选留种，共 " + count + " 份。");
        Engine.run([{ type: 'gain_skill_exp', category: 'production', skill_id: 'farming', amount: 8 }]);
        delete crops[key];
        Engine.state.home_crops = crops;
        Engine.render();
    },

    build_building(c) {
        if (Engine.curId !== 'home' || !Engine.cur || !Engine.cur.grid) return;
        const buildingId = c && c.building_id;
        const buildings = Engine.db.buildings || {};
        const building = buildingId ? buildings[buildingId] : null;
        if (!building || !(Engine.state.unlocked_buildings || {})[buildingId]) {
            Engine.log("该建筑尚未解锁或不存在。");
            return;
        }
        const materials = building.materials || {};
        const playerInv = Engine.state.inventory || {};
        const playerLocked = Engine.state.inventory_locked || {};
        const home = typeof Engine.getHomeStorage === 'function' ? Engine.getHomeStorage() : null;
        const containerLocked = home && home.id ? ((Engine.state.container_locked || {})[home.id] || {}) : {};

        for (const [matId, need] of Object.entries(materials)) {
            const have = typeof Engine.countAvailableMaterial === 'function' ? Engine.countAvailableMaterial(matId) : 0;
            if (have < need) {
                Engine.log("材料不足，无法建造。");
                return;
            }
        }
        for (const [matId, need] of Object.entries(materials)) {
            let left = need;
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
                Engine.log("材料不足，无法建造。");
                return;
            }
        }
        const farmland = Engine.state.home_farmland || [];
        let emptyIdx = -1;
        for (let i = 0; i < Engine.cur.grid.length; i++) {
            const cell = Engine.cur.grid[i];
            if (!cell) continue;
            if (cell.object_id || cell.npc_id || cell.farmland) continue;
            if (cell.sn && cell.sn !== '') continue;
            emptyIdx = i;
            break;
        }
        if (emptyIdx < 0) {
            Engine.log("家中没有空地可放置建筑。");
            return;
        }
        Engine.cur.grid[emptyIdx].object_id = building.object_id || buildingId;
        Engine.log("你建造了" + (building.sn || buildingId) + "。");
        Engine.render();
    },

    upgrade_building(c) {
        if (Engine.curId !== 'home' || !Engine.cur || !Engine.cur.grid) return;
        const idx = Engine.pIdx;
        const cell = Engine.cur.grid[idx];
        const currentOid = cell && cell.object_id;
        const buildings = Engine.db.buildings || {};
        const building = currentOid ? buildings[currentOid] : null;
        if (!building || !building.upgrade_to || !building.upgrade_materials) {
            Engine.log("此处建筑无法升级。");
            return;
        }
        const materials = building.upgrade_materials;
        const playerInv = Engine.state.inventory || {};
        const playerLocked = Engine.state.inventory_locked || {};
        const home = typeof Engine.getHomeStorage === 'function' ? Engine.getHomeStorage() : null;
        const containerLocked = home && home.id ? ((Engine.state.container_locked || {})[home.id] || {}) : {};
        for (const [matId, need] of Object.entries(materials)) {
            const have = typeof Engine.countAvailableMaterial === 'function' ? Engine.countAvailableMaterial(matId) : 0;
            if (have < need) {
                Engine.log("材料不足，无法升级。");
                return;
            }
        }
        for (const [matId, need] of Object.entries(materials)) {
            let left = need;
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
                Engine.log("材料不足，无法升级。");
                return;
            }
        }
        const nextBuilding = buildings[building.upgrade_to];
        const nextSn = nextBuilding && nextBuilding.sn ? nextBuilding.sn : building.upgrade_to;
        cell.object_id = building.upgrade_to;
        Engine.log("你用建材将此处升级为" + nextSn + "。");
        Engine.render();
    },

    process_life_product(c) {
        if (Engine.curId !== 'home' || !Engine.cur || !Engine.cur.grid) return;
        const buildingId = c && c.building_id;
        const buildings = Engine.db.buildings || {};
        const building = buildingId ? buildings[buildingId] : null;
        const recipes = building && building.process ? building.process : [];
        const idx = typeof (c && c.recipe_index) === 'number' ? c.recipe_index : 0;
        const recipe = recipes[idx];
        if (!recipe) {
            Engine.log("没有对应的加工方式。");
            return;
        }
        const matId = recipe.input;
        const need = recipe.input_count || 1;
        const outId = recipe.output;
        const outCount = recipe.output_count || 1;
        const have = typeof Engine.countAvailableMaterial === 'function' ? Engine.countAvailableMaterial(matId) : 0;
        if (have < need) {
            Engine.log("材料不足，无法加工。");
            return;
        }
        const playerInv = Engine.state.inventory || {};
        const playerLocked = Engine.state.inventory_locked || {};
        const home = typeof Engine.getHomeStorage === 'function' ? Engine.getHomeStorage() : null;
        const containerLocked = home && home.id ? ((Engine.state.container_locked || {})[home.id] || {}) : {};
        let left = need;
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
            Engine.log("材料不足，无法加工。");
            return;
        }
        const cat = building.skill_category || 'production';
        const skillId = building.skill_id || 'logging';
        const prog = Engine.getSkillProgress && Engine.getSkillProgress(cat, skillId);
        const skillLevel = prog && (prog.level != null) ? prog.level : 1;
        const outQuality = (typeof rollGatherQuality === 'function' ? rollGatherQuality(skillLevel) : 1);
        const outSn = (Engine.db.objects && Engine.db.objects[outId] && Engine.db.objects[outId].sn) || outId;
        for (let i = 0; i < outCount; i++) {
            const q = i === 0 ? outQuality : (typeof rollGatherQuality === 'function' ? rollGatherQuality(skillLevel) : 1);
            Engine.run([{ type: 'add_to_inventory', item_id: outId, count: 1, quality: q }]);
        }
        let gotSpecial = false;
        const specialId = recipe.output_special;
        if (specialId) {
            const buildingLevel = building.level || 1;
            const successRate = buildingLevel === 1 ? 0.35 : (buildingLevel === 2 ? 0.55 : 0.75);
            if (Math.random() < successRate) {
                const specialQuality = typeof rollGatherQuality === 'function' ? rollGatherQuality(skillLevel) : 1;
                Engine.run([{ type: 'add_to_inventory', item_id: specialId, count: 1, quality: specialQuality }]);
                gotSpecial = true;
            }
        }
        const specialSn = gotSpecial && (typeof UI !== 'undefined' && UI.getItemDisplayName) ? UI.getItemDisplayName(specialId, Engine.state) : '';
        Engine.log("你在" + (building.sn || buildingId) + "上完成了粗制加工，得到" + outSn + (gotSpecial && specialSn ? "与" + specialSn : "") + "。");
        Engine.render();
    }
};
