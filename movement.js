/**
 * 移动、时间、场景与地面效果。依赖 Engine（全局）。由 main 在 init/run/render 时调用。
 */
const Movement = {
    dist(a, b) {
        const cols = (Engine.cur && Engine.cur.cols) || 8;
        return Math.abs(Math.floor(a / cols) - Math.floor(b / cols)) + Math.abs(a % cols - b % cols);
    },

    setupKeyboardControls() {
        document.addEventListener('keydown', (e) => {
            if (document.querySelector('.modal-overlay:not(.hidden)')) return;
            if (Engine.state && Engine.state.upgrading_skill_id) return;
            let targetIndex = -1;
            const pIdx = Engine.pIdx;
            const COLS = Engine.cur.cols || 8;
            switch (e.key) {
                case 'w':
                case 'ArrowUp': targetIndex = pIdx - COLS; break;
                case 's':
                case 'ArrowDown': targetIndex = pIdx + COLS; break;
                case 'a':
                case 'ArrowLeft':
                    if (pIdx % COLS === 0) return;
                    targetIndex = pIdx - 1;
                    break;
                case 'd':
                case 'ArrowRight':
                    if (pIdx % COLS === COLS - 1) return;
                    targetIndex = pIdx + 1;
                    break;
                default: return;
            }
            e.preventDefault();
            if (targetIndex >= 0 && targetIndex < Engine.cur.grid.length) Engine.click(targetIndex);
        });
    },

    loadScene(id, entry = null) {
        if (!Engine.db.scenes[id]) return;
        Engine.curId = id;
        Engine.cur = JSON.parse(JSON.stringify(Engine.db.scenes[id]));
        if (id === 'home' && Engine.state.home_farmland && Engine.state.home_farmland.length > 0) {
            Engine.state.home_farmland.forEach(idx => {
                if (Engine.cur.grid[idx]) Engine.cur.grid[idx].farmland = true;
            });
        }
        if (entry !== null) Engine.pIdx = entry;
        Engine.render();
        Engine.log(`<b>[环境]</b> 抵达：${Engine.cur.name}`);
    },

    advanceTime(mins) {
        const m = Number(mins) || 0;
        if (m <= 0) return;
        const turnsPassed = Math.floor(m / 10);
        Engine.time.minute += m;
        while (Engine.time.minute >= 60) { Engine.time.minute -= 60; Engine.time.hour++; }
        while (Engine.time.hour >= 24) {
            Engine.time.hour -= 24;
            Engine.time.day++;
            Engine.state.day_index = (Engine.state.day_index || 1) + 1;
            if (Engine.ensureTodayAlmanac) Engine.ensureTodayAlmanac();
        }

        const tenMinSteps = m / 10;
        const fullDecay = (Engine.state.fullness_decay_mult || 1) * 0.35 * tenMinSteps;
        const hydDecay = (Engine.state.hydration_decay_mult || 1) * 0.35 * tenMinSteps;
        const fatigueGain = (Engine.state.fatigue_gain_mult || 1) * 0.21 * tenMinSteps;
        Engine.state.fullness = Math.max(0, Engine.state.fullness - fullDecay);
        Engine.state.hydration = Math.max(0, Engine.state.hydration - hydDecay);
        Engine.state.fatigue = Math.min(100, Engine.state.fatigue + fatigueGain);
        if (Engine.state.hydration <= 0) {
            Engine.dehydrationAccum += m;
            while (Engine.dehydrationAccum >= 30) {
                Engine.dehydrationAccum -= 30;
                const limbs = Engine.state.limbs || {};
                Object.keys(limbs).forEach(limb => {
                    if (limbs[limb] > 0) Engine.state.limbs[limb] = Math.max(0, limbs[limb] - 1);
                });
                Engine.log("脱水令你浑身发虚，伤势加重。");
            }
        } else {
            Engine.dehydrationAccum = 0;
        }

        if (turnsPassed > 0) {
            Movement.runGroundCellEffects();
            Movement.runGroundDecay();
        }
        if (turnsPassed > 0) {
            const buffsToRemove = [];
            for (const activeBuff of Engine.state.buffs) {
                const buffDef = Engine.db.buffs.definitions[activeBuff.id];
                if (!buffDef) continue;
                if (buffDef.effects && buffDef.effects.on_tick) {
                    for (let i = 0; i < turnsPassed; i++) Engine.run(buffDef.effects.on_tick);
                }
                if (activeBuff.duration !== -1) {
                    activeBuff.duration -= turnsPassed;
                    if (activeBuff.duration <= 0) buffsToRemove.push(activeBuff.id);
                }
            }
            if (buffsToRemove.length > 0) {
                buffsToRemove.forEach(id => Engine.run([{ type: 'remove_buff', id: id }]));
            }
        }
    },

    runGroundCellEffects() {
        Engine.cur.grid.forEach((cell) => {
            if (!cell.groundInventory || Object.keys(cell.groundInventory).length === 0) return;
            const obj = cell.object_id ? Engine.db.objects[cell.object_id] : null;
            if (!obj || cell.object_id !== 'campfire') return;
            const toRemove = [];
            for (const itemId of Object.keys(cell.groundInventory)) {
                const item = (Engine.db.objects && Engine.db.objects[itemId]) || (Engine.db.items && Engine.db.items[itemId]);
                if (!item || (item.tags && item.tags.includes('fireproof'))) continue;
                toRemove.push(itemId);
            }
            toRemove.forEach(itemId => {
                const item = Engine.db.objects[itemId] || Engine.db.items[itemId];
                const n = cell.groundInventory[itemId] || 0;
                delete cell.groundInventory[itemId];
                if (n > 0 && item) Engine.log(`<b>[环境]</b> 篝火将地上的${item.sn}烧毁了。`);
            });
        });
    },

    runGroundDecay() {
        const currentDayNum = Engine.time.month * 31 + Engine.time.day;
        while (currentDayNum >= Engine.lastDecayDay + 3) {
            Engine.lastDecayDay += 3;
            Engine.cur.grid.forEach((cell) => {
                if (!cell.groundInventory || Object.keys(cell.groundInventory).length === 0) return;
                const candidates = [];
                for (const [itemId, count] of Object.entries(cell.groundInventory)) {
                    const item = (Engine.db.objects && Engine.db.objects[itemId]) || (Engine.db.items && Engine.db.items[itemId]);
                    if (item && item.tags && item.tags.includes('indestructible')) continue;
                    for (let i = 0; i < count; i++) candidates.push(itemId);
                }
                if (candidates.length === 0) return;
                const pick = candidates[Math.floor(Math.random() * candidates.length)];
                const item = Engine.db.objects[pick] || Engine.db.items[pick];
                cell.groundInventory[pick] = (cell.groundInventory[pick] || 0) - 1;
                if (cell.groundInventory[pick] <= 0) delete cell.groundInventory[pick];
                if (item) Engine.log(`<b>[环境]</b> 地上的${item.sn}在时光中朽坏了。`);
            });
        }
    },

    click(i) {
        const c = Engine.cur.grid[i];
        const d = Movement.dist(Engine.pIdx, i);
        if (d === 1) {
            if (Engine.state && Engine.state.upgrading_skill_id) return;
            const ref = c.object_id ? Engine.db.objects[c.object_id] : null;
            if (c.blocking || (ref && ref.blocking)) return;
            let legMult = 1;
            if (Engine.state.limbs.l_leg <= 0 && Engine.state.limbs.r_leg <= 0) legMult = 3;
            else if (Engine.state.limbs.l_leg <= 0 || Engine.state.limbs.r_leg <= 0) legMult = 2;
            Engine.pIdx = i;
            const timeCost = Math.max(1, Math.floor(10 * legMult * (Engine.state.move_time_mult || 1)));
            Movement.advanceTime(timeCost);
            // 触发当前格或物体自带的 onStep（如篝火烫伤等环境效果）
            if (c.onStep && Array.isArray(c.onStep) && c.onStep.length > 0) {
                Engine.run(c.onStep);
            } else if (ref && ref.onStep && Array.isArray(ref.onStep) && ref.onStep.length > 0) {
                Engine.run(ref.onStep);
            }
            if (Engine.describeTile) Engine.describeTile(c, ref);
            Engine.render();
        } else if (d === 0) Engine.render();
    }
};
