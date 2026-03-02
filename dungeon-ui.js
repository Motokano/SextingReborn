/**
 * DungeonUI — 地牢房间弹层、路径选择、各房间类型内容展示。
 * 依赖 Engine, DungeonManager, UI, CombatEngine, Movement。
 */
const DungeonUI = (() => {
    const OVERLAY_ID = 'dungeon-overlay';

    function _ensureOverlay() {
        let el = document.getElementById(OVERLAY_ID);
        if (!el) {
            el = document.createElement('div');
            el.id = OVERLAY_ID;
            el.className = 'dungeon-overlay';
            el.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:inherit;padding:20px;box-sizing:border-box;';
            document.body.appendChild(el);
        }
        return el;
    }

    function _hideOverlay() {
        const el = document.getElementById(OVERLAY_ID);
        if (el) { el.innerHTML = ''; el.style.display = 'none'; }
    }

    function _isGridMode() {
        return Engine.curId === 'dungeon' && Engine.state.dungeon && Engine.state.dungeon.active;
    }

    function _onRoomContentDone() {
        const d = Engine.state.dungeon;
        if (d) {
            d.currentRoomContentTriggered = true;
            if (d.map && d.map.grid && (Engine.pIdx != null || d.pIdx != null)) {
                const idx = d.pIdx != null ? d.pIdx : Engine.pIdx;
                const cell = d.map.grid[idx];
                if (cell && cell.dungeon_room_index != null) {
                    if (!d.roomContentTriggered) d.roomContentTriggered = {};
                    d.roomContentTriggered[cell.dungeon_room_index] = true;
                }
            }
        }
        _hideOverlay();
        if (_isGridMode()) Engine.render(); else _showPathSelection();
    }

    function _showPathSelection() {
        const room = DungeonManager.getCurrentRoom();
        const paths = DungeonManager.getPathOptions();
        const isExit = room && room.isExit;
        const overlay = _ensureOverlay();
        overlay.style.display = 'flex';

        const cfg = Engine.db.dungeon || {};
        const typeLabels = cfg.room_types || {};

        let html = '<div class="dungeon-panel" style="background:#1a1a24;border:1px solid #3a3a50;border-radius:6px;padding:24px;max-width:400px;width:100%;">';
        html += '<h2 style="margin:0 0 16px;color:#c8a96e;font-size:1.2rem;">选择去路</h2>';
        if (isExit) {
            html += '<button type="button" class="dungeon-btn dungeon-btn-exit" style="display:block;width:100%;padding:12px;margin-bottom:8px;background:#2a4a2a;color:#afa;border:1px solid #4a6a4a;border-radius:4px;cursor:pointer;">离开地牢</button>';
        }
        paths.forEach(p => {
            const label = (typeLabels[p.room.type] && typeLabels[p.room.type].label) || p.room.type;
            html += `<button type="button" class="dungeon-btn dungeon-path-btn" data-index="${p.index}" style="display:block;width:100%;padding:12px;margin-bottom:8px;background:#2a2a3a;color:#ccc;border:1px solid #4a4a5a;border-radius:4px;cursor:pointer;">${label}</button>`;
        });
        html += '</div>';
        overlay.innerHTML = html;

        overlay.querySelector('.dungeon-btn-exit')?.addEventListener('click', () => {
            DungeonManager.exitDungeon();
            _hideOverlay();
        });
        overlay.querySelectorAll('.dungeon-path-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.getAttribute('data-index'), 10);
                DungeonManager.setCurrentIndex(index);
                _hideOverlay();
                showRoom();
            });
        });
    }

    /** 战斗结束后由 combat.js 或本模块调用；大地图模式下只刷新地图不弹路径选择。 */
    function onCombatEnd() {
        const st = Engine.state;
        if (!st.dungeon || !st.dungeon.active || st.in_combat) return;
        const d = st.dungeon;
        d.currentRoomContentTriggered = true;
        if (d.map && d.map.grid && (Engine.pIdx != null || d.pIdx != null)) {
            const idx = d.pIdx != null ? d.pIdx : Engine.pIdx;
            const cell = d.map.grid[idx];
            if (cell && cell.dungeon_room_index != null) {
                if (!d.roomContentTriggered) d.roomContentTriggered = {};
                d.roomContentTriggered[cell.dungeon_room_index] = true;
            }
        }
        if (_isGridMode()) Engine.render(); else _showPathSelection();
    }

    /** 触发当前房间内容（战斗/宝藏/休息等）。方块地图模式下由 loadDungeonRoom 调用，结束后不弹路径选择。 */
    function triggerRoomContent(room) {
        const d = Engine.state.dungeon;
        if (d) d.currentRoomContentTriggered = true;
        if (!room) return;

        const overlay = _ensureOverlay();
        overlay.style.display = 'flex';

        const cfg = Engine.db.dungeon || {};
        const typeLabels = cfg.room_types || {};
        const label = (typeLabels[room.type] && typeLabels[room.type].label) || room.type;

        if (room.type === 'combat' || room.type === 'boss') {
            const enemyIds = DungeonManager.rollCombatEnemies(room);
            _hideOverlay();
            if (typeof CombatEngine !== 'undefined') CombatEngine.startCombat(enemyIds);
            return;
        }

        if (room.type === 'treasure') {
            const options = DungeonManager.rollTreasureOptions();
            const objs = Engine.db.objects || {};
            let html = '<div class="dungeon-panel" style="background:#1a1a24;border:1px solid #3a3a50;border-radius:6px;padding:24px;max-width:400px;">';
            html += '<h2 style="margin:0 0 12px;color:#c8a96e;">宝藏</h2><p style="color:#aaa;margin-bottom:16px;">选择一件带走：</p>';
            options.forEach((opt, i) => {
                const obj = objs[opt.item_id];
                const name = obj ? obj.sn : opt.item_id;
                html += `<button type="button" class="dungeon-treasure-btn" data-item="${opt.item_id}" style="display:block;width:100%;padding:10px;margin-bottom:8px;text-align:left;background:#252535;color:#ddd;border:1px solid #454555;border-radius:4px;cursor:pointer;">${name}</button>`;
            });
            html += '</div>';
            overlay.innerHTML = html;
            overlay.querySelectorAll('.dungeon-treasure-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const itemId = btn.getAttribute('data-item');
                    if (Engine.runHandlers.add_to_inventory) Engine.runHandlers.add_to_inventory({ item_id: itemId, count: 1 });
                    _onRoomContentDone();
                });
            });
            return;
        }

        if (room.type === 'rest') {
            const restRatio = cfg.rest_limb_ratio != null ? cfg.rest_limb_ratio : 0.3;
            const restEnergy = cfg.rest_energy != null ? cfg.rest_energy : 20;
            const restNeili = cfg.rest_neili != null ? cfg.rest_neili : 30;
            if (Engine.runHandlers.recover_limbs_ratio) Engine.runHandlers.recover_limbs_ratio({ val: restRatio });
            if (Engine.runHandlers.mod_stat) {
                Engine.runHandlers.mod_stat({ key: 'energy', val: restEnergy });
                Engine.runHandlers.mod_stat({ key: 'neili', val: restNeili });
            }
            Engine.log("你在此稍作休息，恢复了部分伤势与气力。");
            let html = '<div class="dungeon-panel" style="background:#1a1a24;border:1px solid #3a3a50;border-radius:6px;padding:24px;">';
            html += '<h2 style="margin:0 0 12px;color:#c8a96e;">休息处</h2><p style="color:#aaa;">你已恢复部分肢体伤势、精力与内力。</p>';
            html += '<button type="button" class="dungeon-continue-btn" style="margin-top:16px;padding:10px 20px;background:#3a3a5a;color:#ddd;border:none;border-radius:4px;cursor:pointer;">继续</button></div>';
            overlay.innerHTML = html;
            overlay.querySelector('.dungeon-continue-btn').addEventListener('click', () => { _onRoomContentDone(); });
            return;
        }

        if (room.type === 'event') {
            const ev = DungeonManager.rollEvent();
            let html = '<div class="dungeon-panel" style="background:#1a1a24;border:1px solid #3a3a50;border-radius:6px;padding:24px;">';
            html += '<h2 style="margin:0 0 12px;color:#c8a96e;">事件</h2><p style="color:#aaa;margin-bottom:16px;">' + (ev.desc || '') + '</p>';
            (ev.choices || []).forEach(ch => {
                html += `<button type="button" class="dungeon-event-btn" data-effect="${ch.effect || 'none'}" data-log="${(ch.log || '')}" style="display:block;width:100%;padding:10px;margin-bottom:8px;background:#252535;color:#ddd;border:1px solid #454555;border-radius:4px;cursor:pointer;">${ch.text || '继续'}</button>`;
            });
            html += '</div>';
            overlay.innerHTML = html;
            overlay.querySelectorAll('.dungeon-event-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const log = btn.getAttribute('data-log');
                    if (log && Engine.log) Engine.log(log);
                    _onRoomContentDone();
                });
            });
            return;
        }

        if (room.type === 'shop') {
            const list = DungeonManager.getShopList();
            const objs = Engine.db.objects || {};
            const silver = Engine.state.silver || 0;
            let html = '<div class="dungeon-panel" style="background:#1a1a24;border:1px solid #3a3a50;border-radius:6px;padding:24px;">';
            html += '<h2 style="margin:0 0 12px;color:#c8a96e;">商店</h2><p style="color:#888;margin-bottom:12px;">银两：' + silver + '</p>';
            list.forEach(entry => {
                const itemId = entry.item_id || entry;
                const price = entry.price != null ? entry.price : 0;
                const obj = objs[itemId];
                const name = obj ? obj.sn : itemId;
                const canBuy = silver >= price;
                html += `<button type="button" class="dungeon-shop-btn" data-item="${itemId}" data-price="${price}" ${!canBuy ? 'disabled' : ''} style="display:block;width:100%;padding:10px;margin-bottom:8px;text-align:left;background:#252535;color:${canBuy ? '#ddd' : '#666'};border:1px solid #454555;border-radius:4px;cursor:${canBuy ? 'pointer' : 'not-allowed'};">${name} — ${price} 银两</button>`;
            });
            html += '<button type="button" class="dungeon-continue-btn" style="margin-top:12px;padding:10px;background:#3a3a5a;color:#ddd;border:none;border-radius:4px;cursor:pointer;">不买了，继续</button></div>';
            overlay.innerHTML = html;
            overlay.querySelectorAll('.dungeon-shop-btn').forEach(btn => {
                if (btn.disabled) return;
                btn.addEventListener('click', () => {
                    const itemId = btn.getAttribute('data-item');
                    const price = parseInt(btn.getAttribute('data-price'), 10);
                    const st = Engine.state;
                    if ((st.silver || 0) < price) return;
                    st.silver = (st.silver || 0) - price;
                    if (Engine.runHandlers.add_to_inventory) Engine.runHandlers.add_to_inventory({ item_id: itemId, count: 1 });
                    Engine.log("你购买了" + ((Engine.db.objects && Engine.db.objects[itemId]) ? Engine.db.objects[itemId].sn : itemId) + "。");
                    showRoom();
                });
            });
            overlay.querySelector('.dungeon-continue-btn').addEventListener('click', () => { _onRoomContentDone(); });
            return;
        }

        if (room.type === 'trap') {
            const st = Engine.state;
            const damage = DungeonManager.getTrapDamage();
            const neiliCost = DungeonManager.getTrapAvoidNeiliCost();
            const canAvoid = st.combat_awareness && (st.neili || 0) >= neiliCost;

            let html = '<div class="dungeon-panel" style="background:#1a1a24;border:1px solid #3a3a50;border-radius:6px;padding:24px;">';
            html += '<h2 style="margin:0 0 12px;color:#a66;">陷阱</h2>';
            if (canAvoid) {
                html += '<p style="color:#aaa;margin-bottom:12px;">你察觉到了陷阱，可耗费内力小心通过，或直接触发承受伤害。</p>';
                html += `<button type="button" class="dungeon-trap-avoid" style="display:block;width:100%;padding:10px;margin-bottom:8px;background:#2a4a3a;color:#afa;border:1px solid #4a6a5a;border-radius:4px;cursor:pointer;">小心通过（消耗 ${neiliCost} 内力）</button>`;
                html += `<button type="button" class="dungeon-trap-trigger" style="display:block;width:100%;padding:10px;margin-bottom:8px;background:#4a2a2a;color:#faa;border:1px solid #6a4a4a;border-radius:4px;cursor:pointer;">触发陷阱（承受伤害）</button>`;
            } else {
                html += '<p style="color:#aaa;">你触发了陷阱！</p>';
            }
            html += '</div>';
            overlay.innerHTML = html;

            const applyDamage = () => {
                const limbs = Object.keys(st.limbs || {});
                if (limbs.length > 0) {
                    const pick = limbs[Math.floor(Math.random() * limbs.length)];
                    if (pick && Engine.applyLimbDamage) Engine.applyLimbDamage(pick, -damage);
                }
                Engine.log("陷阱对你造成了伤害。");
                _onRoomContentDone();
            };

            overlay.querySelector('.dungeon-trap-avoid')?.addEventListener('click', () => {
                st.neili = Math.max(0, (st.neili || 0) - neiliCost);
                Engine.log("你小心地绕过了陷阱。");
                _hideOverlay();
                _onRoomContentDone();
            });
            overlay.querySelectorAll('.dungeon-trap-trigger').forEach(btn => {
                btn.addEventListener('click', applyDamage);
            });
            if (!canAvoid) {
                applyDamage();
            }
            return;
        }

        _onRoomContentDone();
    }

    function showRoom() {
        const room = DungeonManager.getCurrentRoom();
        triggerRoomContent(room);
    }

    return { showRoom, triggerRoomContent, onCombatEnd, _hideOverlay: _hideOverlay };
})();
