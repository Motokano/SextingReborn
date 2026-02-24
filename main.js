const Engine = {
    db: { config: null, scenes: null, npcs: null, status: null }, // 数据仓库
    cur: null, pIdx: 0, flags: {}, 
    time: { month: 2, day: 24, hour: 8, minute: 0 },
    state: {
        limbs: { head: 35, chest: 75, l_arm: 60, r_arm: 60, l_leg: 60, r_leg: 60, stomach: 50 },
        maxLimbs: { head: 35, chest: 75, l_arm: 60, r_arm: 60, l_leg: 60, r_leg: 60, stomach: 50 },
        stamina: 200, maxStamina: 200, energy: 100, maxEnergy: 100, qi: 0, 
        fullness: 100, hydration: 100, fatigue: 0, buffs: []
    },

    async init() {
        try {
            // 分别调用四个 JSON 文件
            const files = ['config', 'scenes', 'npcs', 'status'];
            const results = await Promise.all(files.map(f => fetch(`./data/${f}.json?v=${Date.now()}`).then(r => r.json())));
            
            files.forEach((f, i) => this.db[f] = results[i]);
            
            this.setupResizer();
            this.loadScene(this.db.config.startScene);
        } catch (err) {
            console.error("数据加载失败，请确保目录下有 data 文件夹及对应 JSON", err);
        }
    },

    loadScene(id) {
        this.cur = JSON.parse(JSON.stringify(this.db.scenes[id]));
        const f = this.cur.grid.findIndex(c => c.player_start);
        this.pIdx = (f !== -1) ? f : 0;
        this.render();
        this.log(`<b>[环境]</b> 抵达了：${this.cur.name}`);
    },

    advanceTime(mins) {
        this.time.minute += mins;
        while (this.time.minute >= 60) { this.time.minute -= 60; this.time.hour++; }
        while (this.time.hour >= 24) { this.time.hour -= 24; this.time.day++; }

        const ticks = Math.max(1, Math.floor(mins / 10));
        for(let i=0; i<ticks; i++) {
            this.state.fullness = Math.max(0, this.state.fullness - 0.4);
            this.state.hydration = Math.max(0, this.state.hydration - 0.7);
            this.state.fatigue = Math.min(100, this.state.fatigue + 0.2);
            this.tickBuffs();
        }
        this.updateVisualTheme();
        this.render();
    },

    tickBuffs() {
        this.state.buffs.forEach((b, idx) => {
            const proto = this.db.status[b.id];
            if (proto && proto.onTick) this.run(proto.onTick);
            b.timer--;
            if (b.timer <= 0) {
                this.log(`<b>[状态消失]</b> ${proto.name}的效果结束了。`);
                this.state.buffs.splice(idx, 1);
            }
        });
    },

    updateVisualTheme() {
        const app = document.getElementById('game-app');
        if (this.time.hour >= 19 || this.time.hour < 6) app.classList.add('night');
        else app.classList.remove('night');
        document.getElementById('time-display').innerText = `${this.time.month}月${this.time.day}日 ${this.time.hour.toString().padStart(2, '0')}:${this.time.minute.toString().padStart(2, '0')}`;
        document.getElementById('loc-display').innerText = this.cur.name;
    },

    render() {
        const g = document.getElementById('action-grid');
        g.style.setProperty('--cols', this.cur.cols);
        document.getElementById('scene-desc').innerText = this.cur.desc;
        g.innerHTML = "";
        
        if (this.state.limbs.head < 10 || this.state.fatigue > 80) document.getElementById('game-app').classList.add('weakened');
        else document.getElementById('game-app').classList.remove('weakened');

        this.cur.grid.forEach((c, i) => {
            const b = document.createElement('div');
            const isP = (i === this.pIdx);
            b.className = `btn ${c.type} ${c.hide ? 'hide' : ''} ${isP ? 'player-token' : ''}`;
            
            // 渲染显示逻辑：如果是 NPC，从 npcs.json 获取显示名
            if (isP) b.innerText = "我";
            else if (!c.hide && c.type !== 'null') {
                const npcData = c.npc_id ? this.db.npcs[c.npc_id] : null;
                b.innerText = npcData ? npcData.sn : (c.sn || "");
            }
            
            b.onclick = () => this.click(i);
            g.appendChild(b);
        });
        this.updateMenu();
    },

    click(i) {
        const c = this.cur.grid[i], d = this.dist(this.pIdx, i);
        if (d === 0) this.updateMenu();
        else if (d === 1) {
            this.pIdx = i; if (c.hide) c.hide = false;
            this.advanceTime(10);
            if (c.onStep) this.run(c.onStep);
            this.render();
        }
    },

    updateMenu() {
        const s = document.getElementById('self-options'); s.innerHTML = "";
        this.db.config.sys_acts.forEach(a => {
            const b = document.createElement('button'); b.className = "menu-btn"; b.innerText = a.label;
            b.onclick = () => { this.advanceTime(5); this.run(a.cmd); };
            s.appendChild(b);
        });

        const ctxSec = document.getElementById('context-section');
        const ctxOpts = document.getElementById('context-options');
        const c = this.cur.grid[this.pIdx];

        // 获取当前格子的交互列表（来自场景定义或引用的 NPC 定义）
        let acts = c.acts || [];
        let fullName = c.fn || "当前位置";
        
        if (c.npc_id && this.db.npcs[c.npc_id]) {
            const npc = this.db.npcs[c.npc_id];
            acts = npc.acts;
            fullName = npc.fn;
        }

        if (c.type !== 'null' && acts.length > 0) {
            ctxSec.classList.remove('hidden');
            ctxOpts.innerHTML = `<p style="font-size:11px;color:#999;margin-bottom:5px">${fullName}</p>`;
            acts.forEach(a => {
                if (a.once && this.flags[a.label]) return;
                const b = document.createElement('button'); b.className = "menu-btn"; b.innerText = a.label;
                b.onclick = () => { this.advanceTime(10); this.flags[a.label]=true; this.run(a.cmd); this.render(); };
                ctxOpts.appendChild(b);
            });
        } else ctxSec.classList.add('hidden');
    },

    dist(a, b) { const w = this.cur.cols; return Math.abs(Math.floor(a/w)-Math.floor(b/w)) + Math.abs(a%w-b%w); },

    run(cmds) {
        cmds.forEach(c => {
            switch(c.type) {
                case 'log': this.log(c.val); break;
                case 'move': this.loadScene(c.target); break;
                case 'faint': this.faint(c.ms || 5000); break;
                case 'dmg_limb': this.state.limbs[c.limb] = Math.max(0, this.state.limbs[c.limb] + c.val); this.flash(); break;
                case 'mod_stat': this.state[c.key] = Math.max(0, Math.min(100, this.state[c.key] + c.val)); break;
                case 'add_buff': this.state.buffs.push({id: c.id, timer: c.dur}); break;
                case 'check_body': this.log(`<b>[感知]</b> ${this.getSensation()}`); break;
            }
        });
        this.render();
    },

    getSensation() {
        const l = this.state.limbs, st = this.state;
        let s = [];
        if (l.head < 20) s.push("脑袋嗡嗡作响。");
        if (st.fullness < 20) s.push("腹中饥火烧肠。");
        if (st.buffs.length > 0) s.push(`<br>【状态：${st.buffs.map(b=>this.db.status[b.id].name).join('、')}】`);
        return s.length > 0 ? s.join(' ') : "筋骨尚且硬朗。";
    },

    flash() { const a = document.getElementById('game-app'); a.classList.add('damage-flash'); setTimeout(()=>a.classList.remove('damage-flash'),150); },

    faint(ms) {
        const a = document.getElementById('game-app'); a.classList.add('faint');
        this.advanceTime(300);
        setTimeout(() => { a.classList.remove('faint'); this.render(); }, ms);
    },

    log(txt) {
        const e = document.createElement('div'); e.className = 'log'; e.innerHTML = txt;
        document.getElementById('log-content').appendChild(e);
        document.getElementById('log-console').scrollTop = 99999;
    },

    setupResizer() {
        let active = false; const r = document.getElementById('log-resizer'), c = document.getElementById('log-console');
        r.onmousedown = () => active = true;
        document.onmousemove = (e) => {
            if (active) {
                const h = window.innerHeight - e.clientY;
                if (h > 50 && h < window.innerHeight * 0.8) c.style.height = h + 'px';
            }
        };
        document.onmouseup = () => active = false;
    }
};
window.onload = () => Engine.init();