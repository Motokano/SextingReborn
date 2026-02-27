/**
 * 认知模块：根据技能等级与节点类型，在玩家走上地块时输出对应的环境描述（认知滤镜）。
 * 依赖：Engine（state, getSkillProgress, log, hasFishingRod）, UI（getItemDisplayName）
 */
const Cognition = {
    describeTile(cell, ref) {
        if (!cell) return;
        const tags = (ref && ref.tags) || [];
        const s = (typeof Engine !== 'undefined' && Engine.state) || {};

        // 采矿节点：根据采矿等级拆成五个认知阶段（另有 0 阶段：完全无知）
        if (tags.includes('node') && tags.includes('mining')) {
            const mining = Engine.getSkillProgress && Engine.getSkillProgress('production', 'mining');
            if (!mining) {
                Engine.log("这里是一面不起眼的岩壁，你没有特别在意。");
                return;
            }
            const lv = mining.level || 1;
            const oreId = (ref && ref.ore_item_id) || 'iron_ore';
            const name = (typeof UI !== 'undefined' && UI.getItemDisplayName) ? UI.getItemDisplayName(oreId, s) : "矿脉";

            if (lv < 5) Engine.log("你总觉得这面岩壁的颜色和纹理有一点点不对劲，但还说不上来。");
            else if (lv < 15) Engine.log("你隐约觉得这面岩壁底下藏着什么，比周围更坚硬、更沉闷。");
            else if (lv < 35) Engine.log("你几乎可以肯定，这里埋着一条还算像样的矿脉。");
            else if (lv < 70) Engine.log(`你看出这里的矿层走向和质地都有明显特征，八成是可以开采的${name}。`);
            else Engine.log(`你一眼就认出来，这里埋着品质不错的${name}，大概还能判断出产量和难度。`);
            return;
        }

        // 采集节点：根据采集等级拆成五个认知阶段（另有 0 阶段：完全无知）
        if (tags.includes('node') && tags.includes('gather')) {
            const gathering = Engine.getSkillProgress && Engine.getSkillProgress('survival', 'gathering');
            if (!gathering) {
                Engine.log("你路过一片杂乱的草木，在你眼里只是一团绿色。");
                return;
            }
            const lv = gathering.level || 1;
            const plantId = (ref && ref.plant_id) || 'wild_berry';
            const name = (typeof UI !== 'undefined' && UI.getItemDisplayName) ? UI.getItemDisplayName(plantId, s) : "植物";

            if (lv < 5) Engine.log("你注意到这里的草木中有几株形状怪怪的，但一时想不起哪里特别。");
            else if (lv < 15) Engine.log("你开始怀疑，这片草丛里藏着几株可能有用的东西。");
            else if (lv < 35) Engine.log("你几乎可以确定，这里长着可以采集回去试试的野生植物。");
            else if (lv < 70) Engine.log(`你认出这里的植株和记忆里的样子非常接近，应该是可以采集的${name}，大致知道能拿来做什么。`);
            else Engine.log(`你一眼就认出这里是${name}的生长点，连哪些部分该摘、哪些部分不要碰都了然于胸。`);
            return;
        }

        // 伐木节点：根据伐木等级拆成五个认知阶段（另有 0 阶段：完全无知）
        if (tags.includes('node') && tags.includes('logging')) {
            const logging = Engine.getSkillProgress && Engine.getSkillProgress('production', 'logging');
            if (!logging) {
                Engine.log("你路过一棵普普通通的树，没有多想。");
                return;
            }
            const lv = logging.level || 1;
            const woodId = (ref && ref.wood_item_id) || 'rough_log';
            const name = (typeof UI !== 'undefined' && UI.getItemDisplayName) ? UI.getItemDisplayName(woodId, s) : "木料";

            if (lv < 5) Engine.log("你隐约觉得这棵树的形状和树皮纹理有点不太一样，但还说不上来。");
            else if (lv < 15) Engine.log("你开始怀疑，这棵树砍下来也许能得到还算顺手的木料。");
            else if (lv < 35) Engine.log("你几乎可以确定，这是一棵可以好好砍一砍的木料树。");
            else if (lv < 70) Engine.log(`你看出这棵树的干形和纤维走向都相当顺眼，砍下来应该能得到不错的${name}。`);
            else Engine.log(`你一眼就认出这棵树最适合砍哪一段、怎么下斧，能得到怎样的${name}和能用来干什么。`);
            return;
        }

        // 钓鱼节点：根据钓鱼等级拆成五个认知阶段（另有 0 阶段：完全无知）
        if (tags.includes('node') && tags.includes('fishing')) {
            const fishing = Engine.getSkillProgress && Engine.getSkillProgress('survival', 'fishing');
            if (!fishing) {
                Engine.log("你路过水边，只觉得平平无奇，没有多想。");
                return;
            }
            const lv = fishing.level || 1;
            const fishId = (ref && ref.fish_item_id) || 'river_fish';
            const name = (typeof UI !== 'undefined' && UI.getItemDisplayName) ? UI.getItemDisplayName(fishId, s) : "鱼";

            if (lv < 5) Engine.log("你隐约觉得这段水面下似乎有东西在动，但说不准。");
            else if (lv < 15) Engine.log("你开始怀疑，这片水域里可能有鱼可钓。");
            else if (lv < 35) Engine.log("你几乎可以确定，这里是一处能下钩的钓点。");
            else if (lv < 70) Engine.log(`你看出水纹与深浅，八成能钓到${name}。`);
            else Engine.log(`你一眼就判断出这里适合钓${name}，连下钩深浅和时机都心里有数。`);
            if (Engine.hasFishingRod && !Engine.hasFishingRod()) Engine.log("你身边没有鱼竿，没法下钩。");
            return;
        }

        // 种植节点：根据种植等级拆成五个认知阶段（另有 0 阶段：完全无知）
        if (tags.includes('node') && tags.includes('farming')) {
            const farming = Engine.getSkillProgress && Engine.getSkillProgress('production', 'farming');
            if (!farming) {
                Engine.log("你路过一片地，只看到杂草和土，没有多想。");
                return;
            }
            const lv = farming.level || 1;
            const cropId = (ref && ref.crop_item_id) || 'wheat_ear';
            const name = (typeof UI !== 'undefined' && UI.getItemDisplayName) ? UI.getItemDisplayName(cropId, s) : "作物";

            if (lv < 5) Engine.log("你隐约觉得这片地里有些植株长得不太一样，但说不上来。");
            else if (lv < 15) Engine.log("你开始怀疑，这里种过东西，或许还能收。");
            else if (lv < 35) Engine.log("你几乎可以确定，这是一片能收割的田。");
            else if (lv < 70) Engine.log(`你认出熟成的穗子与块根，能收不少${name}。`);
            else Engine.log(`你一眼就看出哪些${name}已熟、该怎么下镰怎么挖，损耗最小。`);
            return;
        }

        // 狩猎节点：根据狩猎等级拆成五个认知阶段（另有 0 阶段：完全无知）
        if (tags.includes('node') && tags.includes('hunting')) {
            const hunting = Engine.getSkillProgress && Engine.getSkillProgress('survival', 'hunting');
            if (!hunting) {
                Engine.log("你穿过林间，只当是寻常野地，没有留意。");
                return;
            }
            const lv = hunting.level || 1;

            if (lv < 5) Engine.log("你隐约觉得地上有蹄印或粪便，但辨不出是什么。");
            else if (lv < 15) Engine.log("你开始怀疑，这一带常有野兽经过，或许能守到。");
            else if (lv < 35) Engine.log("你几乎可以确定，这是一条兽径，适合下套或蹲守。");
            else if (lv < 70) Engine.log("你从痕迹判断出猎物体型与习性，知道该从哪里下手。");
            else Engine.log("你一眼就读出兽径走向、何时会过、该布陷阱还是伏击，心里有数。");
            return;
        }
    }
};
