/**
 * 语言相关 run 命令：say（NPC 对话）。
 * 依赖 Engine, LanguageUtils。
 */
const LanguageActions = {
    say(c) {
        const speaker = c.speaker || '';
        const raw = c.val || '';
        const state = Engine.state;
        const lv = (typeof LanguageUtils !== 'undefined' && LanguageUtils.getCommonTongueLevel)
            ? LanguageUtils.getCommonTongueLevel(state)
            : 0;

        const speakerName = (speaker && Engine.db && Engine.db.npcs && Engine.db.npcs[speaker] && Engine.db.npcs[speaker].sn)
            ? Engine.db.npcs[speaker].sn
            : (speaker || '对方');

        if (lv <= 0) {
            const masked = (typeof LanguageUtils !== 'undefined' && LanguageUtils.maskText)
                ? LanguageUtils.maskText(raw, 0, (Engine.state.day_index || 1) + speakerName.length)
                : String(raw || '');
            Engine.log(`<b>[对话]</b> ${speakerName}：<span style="color:#666;">（你听不懂对方的语言，只能捕捉到些语气与停顿。）</span><br><span style="color:#333;">${masked}</span>`);
            return;
        }

        const masked = (typeof LanguageUtils !== 'undefined' && LanguageUtils.maskText)
            ? LanguageUtils.maskText(raw, lv, (Engine.state.day_index || 1) + speakerName.length)
            : String(raw || '');

        const hint = lv < 15 ? '<span style="color:#666;">（你听懂了几个零碎的词。）</span><br>' : '';
        Engine.log(`<b>[对话]</b> ${speakerName}：${hint}${masked}`);

        // 通过对话极慢推进通用语熟练度（需要长期交流才明显提升）
        const prog = Engine.getSkillProgress && Engine.getSkillProgress('support', 'common_tongue');
        if (prog) {
            const amt = Math.max(0.03, Math.min(0.15, 0.03 + (raw.length || 0) / 600));
            Engine.run([{ type: 'gain_skill_exp', category: 'support', skill_id: 'common_tongue', amount: amt }]);
        }
    }
};

