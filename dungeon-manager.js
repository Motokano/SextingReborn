/**
 * DungeonManager — 地牢生成、状态、导航与死亡/出口处理。
 * 依赖 Engine, Engine.db.dungeon, Engine.db.enemies。
 */
const DungeonManager = {
    getEnemySn(enemyId) {
        const db = (Engine.db && Engine.db.enemies) ? Engine.db.enemies : {};
        const def = enemyId ? db[enemyId] : null;
        return (def && def.sn) ? def.sn : (enemyId || '敌人');
    },

    /**
     * 生成一整张大地图：若干房间（由相邻格子组成），出口房间不为第一间。
     * 返回 { cols, grid, rooms, startCellIndex }。
     */
    generateDungeonMap(ticket) {
        const cfg = Engine.db.dungeon || {};
        const cols = cfg.map_cols != null ? cfg.map_cols : 8;
        const rows = cfg.map_rows != null ? cfg.map_rows : 8;
        const total = cols * rows;
        const [minR, maxR] = cfg.room_count_range || [6, 10];
        const roomCount = Math.min(
            minR + Math.floor(Math.random() * (maxR - minR + 1)),
            Math.max(1, Math.floor(total / 4))
        );

        const types = cfg.room_types || {};
        const typeKeys = Object.keys(types).filter(k => k !== 'boss');
        if (typeKeys.length === 0) typeKeys.push('event');

        const seeds = [];
        const used = {};
        while (seeds.length < roomCount) {
            const idx = Math.floor(Math.random() * total);
            if (used[idx]) continue;
            used[idx] = true;
            seeds.push(idx);
        }

        const cellToRoom = [];
        for (let i = 0; i < total; i++) {
            let best = 0;
            let bestDist = Infinity;
            const row = Math.floor(i / cols);
            const col = i % cols;
            for (let r = 0; r < seeds.length; r++) {
                const sr = Math.floor(seeds[r] / cols);
                const sc = seeds[r] % cols;
                const d = Math.abs(row - sr) + Math.abs(col - sc);
                if (d < bestDist) { bestDist = d; best = r; }
            }
            cellToRoom[i] = best;
        }

        const roomCells = [];
        for (let r = 0; r < roomCount; r++) roomCells[r] = [];
        for (let i = 0; i < total; i++) roomCells[cellToRoom[i]].push(i);

        const bossRoomIndex = Math.floor(Math.random() * roomCount);
        const exitCandidates = [];
        for (let i = 1; i < roomCount; i++) exitCandidates.push(i);
        const exitRoomIndex = exitCandidates.length ? exitCandidates[Math.floor(Math.random() * exitCandidates.length)] : -1;

        const rooms = [];
        for (let r = 0; r < roomCount; r++) {
            let type = typeKeys[Math.floor(Math.random() * typeKeys.length)];
            if (r === bossRoomIndex) type = 'boss';
            rooms.push({
                id: r,
                type,
                isBoss: type === 'boss',
                isExit: r === exitRoomIndex,
                pathIndices: []
            });
        }

        const grid = [];
        const typeLabels = cfg.room_types || {};
        for (let i = 0; i < total; i++) {
            const roomIndex = cellToRoom[i];
            const room = rooms[roomIndex];
            const cells = roomCells[roomIndex];
            const label = (typeLabels[room.type] && typeLabels[room.type].label) || room.type;

            let dungeon_content_type = 'empty';
            let dungeon_leave = false;
            let sn = ' ';

            const contentCell = cells[Math.floor(Math.random() * cells.length)];
            if (contentCell === i) {
                dungeon_content_type = 'content';
                sn = label;
            }
            if (room.isExit) {
                const exitCell = cells[Math.floor(Math.random() * cells.length)];
                if (exitCell === i) {
                    dungeon_leave = true;
                    sn = '离开地牢';
                }
            }

            grid[i] = {
                sn,
                dungeon_cell: true,
                dungeon_room_index: roomIndex,
                dungeon_content_type,
                dungeon_leave: dungeon_leave || undefined
            };
        }

        const startCells = roomCells[0];
        let startCellIndex = startCells[0];
        for (const idx of startCells) {
            if (grid[idx].dungeon_content_type === 'content') { startCellIndex = idx; break; }
        }

        return { name: '地牢', cols, grid, rooms, startCellIndex };
    },

    enterDungeon(ticket, entranceSceneId, entrancePIdx) {
        const built = this.generateDungeonMap(ticket);
        const st = Engine.state;
        const grid = built.grid;
        const rooms = built.rooms || [];

        // 为普通战斗房间预生成在地图上游走的敌人
        const roomEnemies = {};
        rooms.forEach(room => {
            if (!room || room.type !== 'combat' || room.isBoss) return;
            // 找到该房间的内容格（原本用于触发房间事件）
            let contentIndex = null;
            for (let i = 0; i < grid.length; i++) {
                const cell = grid[i];
                if (!cell || cell.dungeon_room_index !== room.id) continue;
                if (cell.dungeon_content_type === 'content') {
                    contentIndex = i;
                    break;
                }
            }
            if (contentIndex == null) return;
            const enemyIds = DungeonManager.rollCombatEnemies(room);
            if (!enemyIds || enemyIds.length === 0) return;
            const primaryId = enemyIds[0];
            const enemySn = DungeonManager.getEnemySn(primaryId);
            roomEnemies[room.id] = {
                enemy_ids: [primaryId],
                cell_index: contentIndex,
                alive: true,
                enemy_sn: enemySn
            };
            const cell = grid[contentIndex];
            cell.dungeon_content_type = 'enemy';
            cell.dungeon_enemy = true;
            cell.dungeon_enemy_room_index = room.id;
            cell.dungeon_enemy_id = primaryId;
            cell.sn = enemySn;
        });

        st.dungeon = {
            active: true,
            ticket: ticket || { level: 1, type: 'default' },
            entranceSceneId: entranceSceneId || Engine.curId,
            entrancePIdx: entrancePIdx != null ? entrancePIdx : Engine.pIdx,
            map: { name: built.name, cols: built.cols, grid },
            rooms,
            pIdx: built.startCellIndex,
            roomContentTriggered: {},
            room_enemies: roomEnemies,
            active_enemy_room_index: null,
            exploredRooms: { 0: true },
            snapshot_inventory: JSON.parse(JSON.stringify(st.inventory || {})),
            snapshot_quality: JSON.parse(JSON.stringify(st.inventory_quality || {}))
        };
        Engine.curId = 'dungeon';
        Engine.cur = st.dungeon.map;
        Engine.pIdx = built.startCellIndex;
        if (typeof Engine.render === 'function') Engine.render();
        const room0 = built.rooms[0];
        // 首房为非战斗房时，仍然按原逻辑立刻触发房间事件；普通战斗房改为地图上游走的敌人，不直接弹战斗
        if (room0 && room0.type !== 'combat' && typeof DungeonUI !== 'undefined' && DungeonUI.triggerRoomContent) {
            DungeonUI.triggerRoomContent(room0);
        }
    },

    takeSnapshot() {
        const st = Engine.state;
        if (!st.dungeon || !st.dungeon.active) return;
        st.dungeon.snapshot_inventory = JSON.parse(JSON.stringify(st.inventory || {}));
        st.dungeon.snapshot_quality = JSON.parse(JSON.stringify(st.inventory_quality || {}));
    },

    restoreSnapshot() {
        const st = Engine.state;
        if (!st.dungeon || !st.dungeon.active) return;
        const d = st.dungeon;
        st.inventory = JSON.parse(JSON.stringify(d.snapshot_inventory || {}));
        st.inventory_quality = JSON.parse(JSON.stringify(d.snapshot_quality || {}));
        if (st.current_weight != null) {
            let w = 0;
            const objs = Engine.db.objects || {};
            Object.entries(st.inventory).forEach(([slotKey, count]) => {
                const baseId = typeof InventoryUtils !== 'undefined' ? InventoryUtils.getBaseItemId(slotKey) : slotKey;
                const item = objs[baseId];
                if (item && item.weight) w += item.weight * (count || 1);
            });
            st.current_weight = w;
        }
    },

    getCurrentRoom() {
        const d = Engine.state.dungeon;
        if (!d || !d.active || !d.rooms || !d.map || !d.map.grid) return null;
        const pIdx = d.pIdx != null ? d.pIdx : Engine.pIdx;
        const cell = d.map.grid[pIdx];
        if (!cell || cell.dungeon_room_index == null) return d.rooms[0] || null;
        return d.rooms[cell.dungeon_room_index] || null;
    },

    getPathOptions() {
        const room = this.getCurrentRoom();
        if (!room) return [];
        return (room.pathIndices || []).map(i => ({ index: i, room: Engine.state.dungeon.rooms[i] }));
    },

    setCurrentIndex(index) {
        const d = Engine.state.dungeon;
        if (!d || !d.active) return;
        d.currentIndex = index;
    },

    isExitRoom(index) {
        const d = Engine.state.dungeon;
        if (!d || !d.rooms) return false;
        const r = d.rooms[index];
        return r && r.isExit;
    },

    /** 构建当前房间的方块地图 grid，用于大地图式移动与互动。 */
    buildRoomGrid(roomIndex) {
        const d = Engine.state.dungeon;
        const cfg = Engine.db.dungeon || {};
        if (!d || !d.rooms) return null;
        const room = d.rooms[roomIndex];
        if (!room) return null;
        const typeLabels = cfg.room_types || {};
        const label = (typeLabels[room.type] && typeLabels[room.type].label) || room.type;
        const cols = cfg.grid_room_cols != null ? cfg.grid_room_cols : 3;
        const rows = cfg.grid_room_rows != null ? cfg.grid_room_rows : 2;
        const total = cols * rows;
        const grid = [];
        grid[0] = {
            sn: label,
            dungeon_cell: true,
            dungeon_content_type: room.type,
            dungeon_room_index: roomIndex
        };
        const pathIndices = room.pathIndices || [];
        if (room.isExit) {
            grid[1] = { sn: '离开地牢', dungeon_cell: true, dungeon_content_type: 'exit', dungeon_leave: true };
            for (let i = 2; i < total; i++) grid[i] = { sn: ' ', dungeon_cell: true, dungeon_content_type: 'empty' };
        } else {
            for (let i = 0; i < pathIndices.length && 1 + i < total; i++) {
                grid[1 + i] = {
                    sn: '通往下层',
                    dungeon_cell: true,
                    dungeon_content_type: 'exit',
                    dungeon_path_to: pathIndices[i]
                };
            }
            for (let i = 1 + pathIndices.length; i < total; i++) {
                grid[i] = { sn: ' ', dungeon_cell: true, dungeon_content_type: 'empty' };
            }
        }
        return { name: '地牢', cols, grid };
    },

    /** 大地图模式下：恢复 Engine.cur / Engine.pIdx 并渲染；进入时由 enterDungeon 直接设好并触发首房。 */
    loadDungeonRoom() {
        const st = Engine.state;
        const d = st.dungeon;
        if (!d || !d.active || !d.map) return;
        Engine.curId = 'dungeon';
        Engine.cur = d.map;
        Engine.pIdx = d.pIdx != null ? d.pIdx : 0;
        if (typeof Engine.render === 'function') Engine.render();
    },

    exitDungeon() {
        const st = Engine.state;
        const d = st.dungeon;
        if (!d || !d.active) return;
        const sceneId = d.entranceSceneId || Engine.db.config.startScene;
        const pIdx = d.entrancePIdx != null ? d.entrancePIdx : Engine.db.config.startIndex;
        st.dungeon = null;
        if (st.pending_recovery && st.pending_recovery.snapshot) st.pending_recovery.retrievable = true;
        Movement.loadScene(sceneId, pIdx);
        Engine.log("你找到了出口，离开了地牢。");
        if (typeof Engine.render === 'function') Engine.render();
    },

    rollCombatEnemies(room) {
        const cfg = Engine.db.dungeon || {};
        const poolName = room && room.isBoss ? 'boss' : 'default';
        const pool = (cfg.enemy_pools || {})[poolName] || cfg.enemy_pools?.default || { ids: ['wolf'], count_range: [1, 1] };
        const ids = pool.ids || ['wolf'];
        const [minC, maxC] = pool.count_range || [1, 1];
        const count = minC + Math.floor(Math.random() * (maxC - minC + 1));
        const result = [];
        for (let i = 0; i < count; i++) result.push(ids[Math.floor(Math.random() * ids.length)]);
        return result;
    },

    rollTreasureOptions() {
        const cfg = Engine.db.dungeon || {};
        const pool = cfg.treasure_pool || ['apple'];
        const n = Math.min(cfg.treasure_pick_count || 3, pool.length);
        const shuffled = pool.slice().sort(() => Math.random() - 0.5);
        return shuffled.slice(0, n).map(item_id => ({ item_id }));
    },

    getShopList() {
        const cfg = Engine.db.dungeon || {};
        return (cfg.shop_pool || []).slice();
    },

    rollEvent() {
        const cfg = Engine.db.dungeon || {};
        const messages = cfg.event_messages || [];
        if (messages.length === 0) return { desc: '此处空无一物。', choices: [{ text: '离开', effect: 'none' }] };
        return messages[Math.floor(Math.random() * messages.length)];
    },

    getTrapDamage() {
        const st = Engine.state;
        const cfg = Engine.db.dungeon || {};
        const ratio = cfg.trap_damage_ratio != null ? cfg.trap_damage_ratio : 0.15;
        const limbs = st.limbs || {};
        const maxLimbs = st.maxLimbs || {};
        let total = 0;
        Object.keys(maxLimbs).forEach(k => { total += maxLimbs[k] || 0; });
        return Math.max(1, Math.floor(total * ratio));
    },

    getTrapAvoidNeiliCost() {
        const cfg = Engine.db.dungeon || {};
        return cfg.trap_avoid_neili_cost != null ? cfg.trap_avoid_neili_cost : 20;
    },

    /** 每次玩家在地牢地图移动一格时调用：推进当前房间内敌人的移动，并在相撞时进入战斗。 */
    advanceEnemies() {
        const st = Engine.state;
        const d = st.dungeon;
        if (!d || !d.active || !d.map || !d.map.grid) return;
        const grid = d.map.grid;
        const playerIdx = d.pIdx != null ? d.pIdx : Engine.pIdx;
        if (playerIdx == null) return;
        const cellHere = grid[playerIdx];
        const roomIndex = cellHere && cellHere.dungeon_room_index != null ? cellHere.dungeon_room_index : null;
        if (roomIndex == null) return;
        const room = d.rooms && d.rooms[roomIndex];
        if (!room || room.type !== 'combat') return;
        const enemiesByRoom = d.room_enemies || {};
        const info = enemiesByRoom[roomIndex];
        if (!info || !info.alive) return;

        const cols = d.map.cols || 8;
        const from = info.cell_index;
        if (from == null || !grid[from]) return;

        const curDist = Movement.dist(from, playerIdx);
        const candidates = [];
        const neighborOffsets = [-1, 1, -cols, cols];
        neighborOffsets.forEach(off => {
            const ni = from + off;
            if (ni < 0 || ni >= grid.length) return;
            const c = grid[ni];
            if (!c || !c.dungeon_cell) return;
            if (c.dungeon_room_index !== roomIndex) return;
            if (c.dungeon_leave || c.dungeon_content_type === 'exit') return;
            const nd = Movement.dist(ni, playerIdx);
            if (nd < curDist) candidates.push({ idx: ni, dist: nd });
        });
        if (candidates.length === 0) return;
        candidates.sort((a, b) => a.dist - b.dist);
        const nextIdx = candidates[0].idx;

        // 清理旧格子的敌人标记
        const oldCell = grid[from];
        if (oldCell) {
            delete oldCell.dungeon_enemy;
            delete oldCell.dungeon_enemy_room_index;
            delete oldCell.dungeon_enemy_id;
            if (oldCell.dungeon_content_type === 'enemy') {
                oldCell.dungeon_content_type = 'empty';
                oldCell.sn = ' ';
            }
        }

        // 标记新格子
        const newCell = grid[nextIdx];
        newCell.dungeon_enemy = true;
        newCell.dungeon_enemy_room_index = roomIndex;
        newCell.dungeon_enemy_id = (info.enemy_ids && info.enemy_ids[0]) || info.enemy_id || 'enemy';
        newCell.dungeon_content_type = 'enemy';
        newCell.sn = info.enemy_sn || DungeonManager.getEnemySn(newCell.dungeon_enemy_id);
        info.cell_index = nextIdx;
        d.room_enemies[roomIndex] = info;

        // 敌人与玩家重合时进入战斗
        if (nextIdx === playerIdx && typeof CombatEngine !== 'undefined' && typeof CombatEngine.startCombat === 'function') {
            d.active_enemy_room_index = roomIndex;
            const ids = (info.enemy_ids && info.enemy_ids.slice()) || [newCell.dungeon_enemy_id];
            CombatEngine.startCombat(ids);
        }
    },

    /** 战斗结束后，由 combat.js 通知；用于处理地牢敌人清除或逃跑后重新生成。 */
    onCombatEndInDungeon(result) {
        const st = Engine.state;
        const d = st.dungeon;
        if (!d || !d.active) return;
        const roomIndex = d.active_enemy_room_index;
        if (roomIndex == null) return;
        const enemiesByRoom = d.room_enemies || {};
        const info = enemiesByRoom[roomIndex];
        if (!info) {
            d.active_enemy_room_index = null;
            return;
        }
        const grid = d.map && d.map.grid;
        const playerIdx = d.pIdx != null ? d.pIdx : Engine.pIdx;
        const cols = d.map ? (d.map.cols || 8) : 8;

        const clearEnemyFromGrid = () => {
            if (!grid) return;
            const idx = info.cell_index;
            if (idx == null || !grid[idx]) return;
            const cell = grid[idx];
            delete cell.dungeon_enemy;
            delete cell.dungeon_enemy_room_index;
            delete cell.dungeon_enemy_id;
            if (cell.dungeon_content_type === 'enemy') {
                cell.dungeon_content_type = 'empty';
                cell.sn = ' ';
            }
        };

        if (result === 'win') {
            clearEnemyFromGrid();
            info.alive = false;
            enemiesByRoom[roomIndex] = info;
            d.room_enemies = enemiesByRoom;
            if (!d.roomContentTriggered) d.roomContentTriggered = {};
            d.roomContentTriggered[roomIndex] = true;
        } else if (result === 'flee') {
            clearEnemyFromGrid();
            if (!grid || playerIdx == null) {
                info.cell_index = null;
            } else {
                const candidates = [];
                for (let i = 0; i < grid.length; i++) {
                    const c = grid[i];
                    if (!c || !c.dungeon_cell) continue;
                    if (c.dungeon_room_index !== roomIndex) continue;
                    if (c.dungeon_leave || c.dungeon_content_type === 'exit') continue;
                    if (c.dungeon_enemy) continue;
                    if (i === playerIdx) continue;
                    const dist = Movement.dist(i, playerIdx);
                    if (dist >= 1 && dist <= 3) candidates.push({ idx: i, dist });
                }
                if (candidates.length > 0) {
                    const pick = candidates[Math.floor(Math.random() * candidates.length)].idx;
                    const cell = grid[pick];
                    cell.dungeon_enemy = true;
                    cell.dungeon_enemy_room_index = roomIndex;
                    cell.dungeon_enemy_id = (info.enemy_ids && info.enemy_ids[0]) || info.enemy_id || 'enemy';
                    cell.dungeon_content_type = 'enemy';
                    cell.sn = info.enemy_sn || DungeonManager.getEnemySn(cell.dungeon_enemy_id);
                    info.cell_index = pick;
                    info.alive = true;
                } else {
                    info.cell_index = null;
                }
            }
            enemiesByRoom[roomIndex] = info;
            d.room_enemies = enemiesByRoom;
        }

        d.active_enemy_room_index = null;
        if (typeof Engine.render === 'function') Engine.render();
    }
};
