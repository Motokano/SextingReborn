/**
 * 效果与肢体伤害：apply(effectId, params, target)、applyLimbDamage(limb, val)。
 * 依赖 Engine, UI。Engine 暴露 applyEffect / applyLimbDamage 时委托本模块。
 */
const LIMB_NAMES = { head: "头部", chest: "胸部", stomach: "腹部", l_arm: "左手", r_arm: "右手", l_leg: "左腿", r_leg: "右腿" };

function checkPlayerDead() {
    const limbs = Engine.state.limbs || {};
    const maxLimbs = Engine.state.maxLimbs || {};
    if (limbs.head != null && maxLimbs.head != null && limbs.head <= 0) return true;
    if (limbs.chest != null && maxLimbs.chest != null && limbs.chest <= 0) return true;
    const total = Object.keys(limbs).reduce((s, k) => s + (limbs[k] || 0), 0);
    return total <= 0;
}

const Effects = {
    applyLimbDamage(limb, val) {
        if (val < 0) {
            let overflow = Math.abs(val);
            const cur = Engine.state.limbs[limb];
            if (cur > 0) {
                const dmg = Math.min(cur, overflow);
                Engine.state.limbs[limb] -= dmg;
                overflow -= dmg;
            }
            if (overflow > 0) {
                const limbName = LIMB_NAMES[limb] || limb;
                Engine.log(`<span style='color:red'>[溢出] <span class="log-limb-injury">${limbName}</span>已毁，余威冲击全身！</span>`);
                const alive = Object.keys(Engine.state.limbs).filter(k => Engine.state.limbs[k] > 0);
                if (alive.length > 0) {
                    const share = overflow / alive.length;
                    alive.forEach(k => Engine.state.limbs[k] = Math.max(0, Engine.state.limbs[k] - share));
                }
            }
            const el = document.getElementById('game-app');
            if (el) {
                el.classList.add('damage-flash');
                setTimeout(() => el.classList.remove('damage-flash'), 150);
            }
            if (checkPlayerDead() && typeof Engine.run === 'function') Engine.run([{ type: 'trigger_death' }]);
        } else {
            Engine.state.limbs[limb] = Math.min(Engine.state.maxLimbs[limb], Engine.state.limbs[limb] + val);
        }
    },

    apply(effectId, params, target) {
        const itemId = params.itemId;
        const timeCost = Number(params.time_cost) || 0;
        if (timeCost > 0 && typeof Engine.advanceTime === 'function') Engine.advanceTime(timeCost);

        if (effectId === 'heal_limb') {
            const healAmount = Number(params.heal) || 0;
            const scope = params.scope || 'single_limb';
            const limbFilter = params.limbFilter || 'alive_only';

            const getState = (t) => {
                if (!t || t.type === 'self') return Engine.state;
                if (t.type === 'npc' && typeof Engine.getNpcState === 'function') return Engine.getNpcState(t.id);
                return Engine.state;
            };
            const st = getState(target);
            if (!st || !st.limbs) {
                Engine.log("目标没有可治疗的部位。");
                return;
            }

            const limbEntries = Object.entries(st.limbs);
            const filterFunc = (k, v) => (limbFilter === 'alive_only' ? v > 0 : true);
            const healOne = (limbKey) => {
                const max = st.maxLimbs ? st.maxLimbs[limbKey] : Engine.state.maxLimbs[limbKey];
                if (max == null) return;
                st.limbs[limbKey] = Math.min(max, st.limbs[limbKey] + healAmount);
            };

            if (scope === 'all_limbs') {
                let any = false;
                limbEntries.forEach(([k, v]) => {
                    if (filterFunc(k, v)) { healOne(k); any = true; }
                });
                if (!any) {
                    Engine.log("没有需要治疗的部位。");
                    return;
                }
                Engine.run([{ type: 'remove_from_inventory', item_id: itemId }]);
                Engine.log("你为目标处理了全身的伤势。");
                Engine.render();
                return;
            }

            const healable = limbEntries
                .map(([k, v]) => {
                    const max = st.maxLimbs ? st.maxLimbs[k] : Engine.state.maxLimbs[k];
                    return filterFunc(k, v) && v < max ? { key: k, hp: v, max } : null;
                })
                .filter(Boolean);
            if (healable.length === 0) {
                Engine.log("没有需要治疗的部位。");
                return;
            }
            const options = healable.map(l => ({ key: l.key, text: `${LIMB_NAMES[l.key] || l.key} (${l.hp.toFixed(0)}/${l.max})` }));
            if (typeof UI !== 'undefined' && UI.showChoiceModal) {
                UI.showChoiceModal("选择治疗部位", options, limbKey => {
                    healOne(limbKey);
                    Engine.run([{ type: 'remove_from_inventory', item_id: itemId }]);
                    Engine.log("你为伤口做了包扎。");
                    Engine.render();
                });
            }
            return;
        }

        if (effectId === 'restore_fullness') {
            const addFull = Number(params.fullness) || 0;
            const addHyd = Number(params.hydration) || 0;
            const st = (target && target.type === 'self') || !target ? Engine.state : (target.type === 'npc' && typeof Engine.getNpcState === 'function' ? Engine.getNpcState(target.id) : Engine.state);
            if (st) {
                if (st.fullness != null) st.fullness = Math.min(100, (st.fullness || 0) + addFull);
                if (addHyd > 0 && st.hydration != null) st.hydration = Math.min(100, (st.hydration || 0) + addHyd);
            }
            if (itemId) Engine.run([{ type: 'remove_from_inventory', item_id: itemId, count: 1 }]);
            const part = [];
            if (addFull > 0) part.push('饱食+' + addFull);
            if (addHyd > 0) part.push('水分+' + addHyd);
            Engine.log("你吃下了食物，" + (part.length ? part.join('，') : '') + "。");
            Engine.render();
            return;
        }

        Engine.log("这个效果尚未实现。");
        Engine.render();
    }
};
