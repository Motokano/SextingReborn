const Engine = {
    db: { config: null, scenes: null, npcs: null, status: null },
    cur: null, pIdx: 0, flags: {}, 
    time: { month: 2, day: 24, hour: 8, minute: 0 },
    state: {
        limbs: { head: 35, chest: 75, l_arm: 60, r_arm: 60, l_leg: 60, r_leg: 60, stomach: 50 },
        maxLimbs: { head: 35, chest: 75, l_arm: 60, r_arm: 60, l_leg: 60, r_leg: 60, stomach: 50 },
        stamina: 200, energy: 100, qi: 0, fullness: 100, hydration: 100, fatigue: 0, buffs: []
    },

    async init() {
        const files = ['config', 'scenes', 'npcs', 'status'];
        const results = await Promise.all(files.map(f => fetch(`./data/${f}.json?v=${Date.now()}`).then(r => r.json())));
        files.forEach((f, i) => this.db[f] = results[i]);
        this.loadScene(this.db.config.startScene);
    },

    loadScene(id) {
        this.cur = JSON.parse(JSON.stringify(this.db.scenes[id]));
        const f = this.cur.grid.findIndex(c => c.player_start);
        this.pIdx = (f !== -1) ? f : 0;
        this.render();
    },

    advanceTime(mins) {
        this.time.minute += mins;
        while (this.time.minute >= 60) { this.time.minute -= 60; this.time.hour++; }
        while (this.time.hour >= 24) { this.time.hour -= 24; this.time.day++; }
        this.state.fullness = Math.max(0, this.state.fullness - mins/80);
        this.state.hydration = Math.max(0, this.state.hydration - mins/60);
        this.state.fatigue = Math.min(100, this.state.fatigue + mins/100);
        this.render();
    },

    render() {
        const app = document.getElementById('game-app');
        if (this.time.hour >= 19 || this.time.hour < 6) app.classList.add('night');
        else app.classList.remove('night');
        
        document.getElementById('time-display').innerText = `${this.time.month}月${this.time.day}日 ${this.time.hour.toString().padStart(2, '0')}:${this.time.minute.toString().padStart(2, '0')}`;
        document.getElementById('loc-display').innerText = this.cur.name;
        document.getElementById('scene-desc').innerText = this.cur.desc;

        const g = document.getElementById('action-grid');
        g.innerHTML = "";
        this.cur.grid.forEach((c, i) => {
            const b = document.createElement('div');
            const isP = (i === this.pIdx);
            b.className = `btn ${c.type || ''} ${c.blocking ? 'blocking' : ''} ${isP ? 'player-token' : ''}`;
            b.innerText = isP ? "我" : (c.sn || "");
            b.onclick = () => this.click(i);
            g.appendChild(b);
        });
        this.renderStats();
        this.updateMenu();
    },

    click(i) {
        const c = this.cur.grid[i], d = this.dist(this.pIdx, i);
        if (d === 1) {
            if (c.blocking) return;
            this.pIdx = i;
            this.advanceTime(10 * (c.timeMult || 1));
            if (c.onStep) this.run(c.onStep);
            this.render();
        } else if (d === 0) this.updateMenu();
    },

    renderStats() {
        const s = this.state;
        const limbs = Object.entries(s.limbs).map(([k, v]) => `${k}:${v.toFixed(0)}`).join(' ');
        document.getElementById('stat-monitor').innerHTML = `
            肢体: ${limbs}<br>
            饱食: ${s.fullness.toFixed(1)} | 饮水: ${s.hydration.toFixed(1)} | 疲劳: ${s.fatigue.toFixed(1)}
        `;
    },

    updateMenu() {
        const s = document.getElementById('self-options'); s.innerHTML = "";
        this.db.config.sys_acts.forEach(a => {
            const b = document.createElement('button'); b.className = "menu-btn"; b.innerText = a.label;
            b.onclick = () => { this.advanceTime(5); this.run(a.cmd); };
            s.appendChild(b);
        });

        const ctxSec = document.getElementById('context-section'), ctxOpts = document.getElementById('context-options');
        const c = this.cur.grid[this.pIdx];
        if (c.acts) {
            ctxSec.classList.remove('hidden');
            ctxOpts.innerHTML = `<p style="font-size:11px;color:#999">${c.fn}</p>`;
            c.acts.forEach(a => {
                const b = document.createElement('button'); b.className = "menu-btn"; b.innerText = a.label;
                b.onclick = () => { this.run(a.cmd); this.render(); };
                ctxOpts.appendChild(b);
            });
        } else ctxSec.classList.add('hidden');
    },

    dist(a, b) { return Math.abs(Math.floor(a/8)-Math.floor(b/8)) + Math.abs(a%8-b%8); },

    run(cmds) {
        cmds.forEach(c => {
            if (c.type === 'log') this.log(c.val);
            if (c.type === 'move') this.loadScene(c.target);
            if (c.type === 'sleep') {
                this.advanceTime(480);
                this.state.fatigue = Math.max(0, this.state.fatigue - 70);
                Object.keys(this.state.limbs).forEach(l => this.state.limbs[l] = Math.min(this.state.maxLimbs[l], this.state.limbs[l]+20));
                this.log("<b>沉睡之后，你感到神清气爽。</b>");
            }
        });
    },

    log(txt) {
        const e = document.createElement('div'); e.className = 'log'; e.innerHTML = txt;
        document.getElementById('log-content').appendChild(e);
        document.getElementById('log-console').scrollTop = 99999;
    },

    setupResizer() { /* 保持前文拉伸条代码 */ }
};
window.onload = () => Engine.init();