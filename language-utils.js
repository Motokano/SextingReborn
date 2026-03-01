/**
 * 语言认知：将“听不懂”的文本做遮罩，通用语等级越高看懂越多。
 * 仅做纯文本处理（输出已转义的 HTML 字符），由 LanguageActions.say 负责包装到日志。
 */
const LanguageUtils = {
    escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    // 简单确定性随机：让同一句话在同一等级下显示稳定
    _rand(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    },

    // 听不懂时显示的“中文乱码”池（无意义或生僻字，像异界口音）
    _noiseChars: '唵嗄哎叭呗啵嚓哒嘀呲咯嘿嚯嗟咔啦嘛呐噢啪嘭呿唷嘶嗒嗡嘘呀吆啧',

    _noiseChar(index, salt) {
        const pool = LanguageUtils._noiseChars;
        const r = LanguageUtils._rand(index * 79 + salt * 41);
        return pool[Math.floor(r * pool.length) % pool.length];
    },

    getCommonTongueLevel(state) {
        const s = state || (typeof Engine !== 'undefined' ? Engine.state : null);
        const prog = s && s.support_skills && s.support_skills.common_tongue;
        const lv = prog && prog.level != null ? Number(prog.level) : 0;
        return Math.max(0, Math.min(100, lv || 0));
    },

    maskText(rawText, level, salt = 0) {
        const raw = String(rawText || '');
        const lv = Math.max(0, Math.min(100, Number(level) || 0));

        // 0→几乎不懂，100→几乎全懂（仍保留一点“口音”感）
        const revealRatio = lv <= 0 ? 0.06 : Math.min(0.95, 0.06 + (lv / 100) * 0.89);
        // 等级越高，越可能“连成片”听懂：2~5 字连续片段
        const chunkLen = Math.max(1, Math.min(5, 1 + Math.floor(lv / 25)));

        const chars = Array.from(raw);
        const reveal = new Array(chars.length).fill(false);

        // 以“片段起点”方式决定可读区域，让低级体现“只言片语”
        for (let i = 0; i < chars.length; i++) {
            const ch = chars[i];
            if (/[\\s,.!?;:，。！？；：、“”‘’（）()《》【】\\[\\]…—\\-]/.test(ch)) {
                reveal[i] = true;
                continue;
            }
            const r = LanguageUtils._rand((i + 1) * 131 + salt * 17);
            // 起点概率略低于 revealRatio，避免“满屏碎字”
            const startProb = Math.max(0.01, Math.min(0.85, revealRatio * 0.55));
            if (r < startProb) {
                const lenAdj = Math.max(1, chunkLen + (LanguageUtils._rand((i + 9) * 97 + salt * 31) < 0.35 ? 1 : 0));
                for (let k = 0; k < lenAdj; k++) {
                    if (i + k >= reveal.length) break;
                    reveal[i + k] = true;
                }
            }
        }

        let out = '';
        for (let i = 0; i < chars.length; i++) {
            const ch = chars[i];
            if (/[\\s,.!?;:，。！？；：、“”‘’（）()《》【】\\[\\]…—\\-]/.test(ch)) {
                out += LanguageUtils.escapeHtml(ch);
                continue;
            }
            if (!reveal[i]) {
                out += LanguageUtils._noiseChar(i, salt);
                continue;
            }
            out += LanguageUtils.escapeHtml(ch);
        }
        return out;
    }
};

