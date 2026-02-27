/**
 * 采集类动作：挖矿、伐木、钓鱼、收割、狩猎等命令的具体执行逻辑。
 * 依赖全局 Engine（run, log, getSkillProgress, getMiningBand）。
 * 由 main.js 的 Engine.run 在对应 type 时调用。
 */
const GameActions = {
    mine_ore(c) {
        const mode = c.mode === 'auto' ? 'auto' : 'manual';
        const difficulty = Math.max(1, Math.min(10, parseInt(c.difficulty, 10) || 1));
        const oreItemId = c.ore_item_id || 'iron_ore';
        const cycles = Math.max(1, parseInt(c.cycles, 10) || 1);

        const miningProg = Engine.getSkillProgress('production', 'mining');
        if (!miningProg) {
            Engine.log("你还不懂挖矿要领，难以下手。");
            return;
        }
        const miningLevel = miningProg.level || 1;
        const band = Engine.getMiningBand(miningLevel);
        const isTrivial = difficulty < band;
        const expPerCycle = mode === 'manual' ? 10 : 4;
        const exp = (mode === 'auto' && isTrivial) ? 0 : expPerCycle * cycles;

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

        if (oreCount > 0) Engine.run([{ type: 'add_to_inventory', item_id: oreItemId, count: oreCount }]);
        if (stoneCount > 0) Engine.run([{ type: 'add_to_inventory', item_id: 'stone', count: stoneCount }]);
        if (oreCount > 0 && stoneCount > 0) Engine.log("你敲下碎石，间或挖到几块像样的矿石。");
        else if (oreCount > 0) Engine.log("你从碎石中挖出几块矿石。");
        else Engine.log("你挖了半天，只敲下些废石。");

        if (exp > 0) Engine.run([{ type: 'gain_skill_exp', category: 'production', skill_id: 'mining', amount: exp }]);
        else if (mode === 'auto' && isTrivial) Engine.log("这种程度的矿石对你而言太过简单，难以再有精进。");
    },

    chop_wood(c) {
        const mode = c.mode === 'auto' ? 'auto' : 'manual';
        const difficulty = Math.max(1, Math.min(10, parseInt(c.difficulty, 10) || 1));
        const woodItemId = c.wood_item_id || 'rough_log';
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
        const exp = (mode === 'auto' && isTrivial) ? 0 : expPerCycle * cycles;

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

        if (woodCount > 0) Engine.run([{ type: 'add_to_inventory', item_id: woodItemId, count: woodCount }]);
        if (woodCount > 0) Engine.log("你把树干处理成了几截还能用的木料。");
        else Engine.log("你砍了半天，不是砍歪就是卡斧，几乎没弄出像样的木料。");

        if (exp > 0) Engine.run([{ type: 'gain_skill_exp', category: 'production', skill_id: 'logging', amount: exp }]);
        else if (mode === 'auto' && isTrivial) Engine.log("这种程度的树对你而言太过简单，难以再有精进。");
    },

    catch_fish(c) {
        const mode = c.mode === 'auto' ? 'auto' : 'manual';
        const manualResult = c.manual_result;
        const difficulty = Math.max(1, Math.min(10, parseInt(c.difficulty, 10) || 1));
        const fishItemId = c.fish_item_id || 'river_fish';
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

        if (fishCount > 0) Engine.run([{ type: 'add_to_inventory', item_id: fishItemId, count: fishCount }]);
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

        if (count > 0) Engine.run([{ type: 'add_to_inventory', item_id: cropItemId, count }]);
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
        const exp = (mode === 'auto' && isTrivial) ? 0 : expPerCycle * cycles;

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

        if (meat > 0) Engine.run([{ type: 'add_to_inventory', item_id: 'raw_meat', count: meat }]);
        if (hideCount > 0) Engine.run([{ type: 'add_to_inventory', item_id: 'hide', count: hideCount }]);
        if (boneCount > 0) Engine.run([{ type: 'add_to_inventory', item_id: 'bone', count: boneCount }]);

        if (meat > 0 || hideCount > 0 || boneCount > 0) Engine.log("你从猎物身上取得了兽肉与皮骨。");
        else Engine.log("这一趟没有碰上合适的猎物。");

        if (exp > 0) Engine.run([{ type: 'gain_skill_exp', category: 'survival', skill_id: 'hunting', amount: exp }]);
        else if (mode === 'auto' && isTrivial) Engine.log("这里的猎物对你来说太过简单，难以再有精进。");
    }
};
