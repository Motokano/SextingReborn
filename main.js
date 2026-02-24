const Engine = {
    db: { config: null, scenes: null },
    cur: null, pIdx: 0, flags: {}, 
    time: { month: 2, day: 24, hour: 8, minute: 0 },
    state: {
        limbs: { head: 35, chest: 75, l_arm: 60, r_arm: 60, l_leg: 60, r_leg: 60, stomach: 50 },
        maxLimbs: { head: 35, chest: 75, l_arm: 60, r_arm: 60, l_leg: 60, r_leg: 60, stomach: 50 },
        stamina: 200, energy: 100, qi: 0, 
        fullness: 100, hydration: 100, fatigue: 0
    },

    async init() {
        const files = ['config', 'scenes'];
        const res = await Promise.all(files.map(f => fetch(`./data/${f}.json?v=${Date.now()}`).then(r => r.json())));
        files.forEach((f, i) => this.db[f] = res[i]);
        this.loadScene(this.db.config.startScene);
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
        
        // 数值自然损耗
        this.state.fullness = Math.max(0, this.state.fullness - mins/80);
        this.state.hydration = Math.max(0, this.state.hydration - mins/60);
        this.state.fatigue = Math.min(100, this.state.fatigue + mins/120);

        this.updateVisual();
        this.render();
    },

    updateVisual() {
        const app = document.getElementById('game-app');
        if (this.time.hour >= 19 || this.time.hour < 6) app.classList.add('night');
        else app.classList.remove('night');
        document.getElementById('time-display').innerText = `${this.time.month}月${this.time.day}日 ${this.time.hour.toString().padStart(2, '0')}:${this.time.minute.toString().padStart(2, '0')}`;
        document.getElementById('loc-display').innerText = this.cur.name;
    },

    render() {
        this.updateVisual();
        const g = document.getElementById('action-grid');
        g.style.setProperty('--cols', 16);
        document.getElementById('scene-desc').innerText = this.cur.desc;
        g.innerHTML = "";

        this.cur.grid.forEach((c, i) => {
            const btn = document.createElement('div');
            const isP = (i === this.pIdx);
            btn.className = `btn ${c.type || ''} ${c.blocking ? 'blocking' : ''} ${isP ? 'player-token' : ''}`;
            if (isP) btn.innerText = "我";
            else if (c.sn) btn.innerText = c.sn;
            btn.onclick = () => this.click(i);
            g.appendChild(btn);
        });
        this.renderStats();
        this.updateMenu();
    },

    click(i) {
        const c = this.cur.grid[i], d = this.dist(this.pIdx, i);
        if (d === 0) this.updateMenu();
        else if (d === 1) {
            if (c.blocking) { this.log(`那里被 <b>${c.fn || c.sn}</b> 挡住了。`); return; }
            const mult = c.timeMult || 1;
            this.pIdx = i;
            this.advanceTime(10 * mult);
            if (c.onStep) this.run(c.onStep);
            this.render();
        }
    },

    renderStats() {
        const s = this.state;
        const limbs = Object.entries(s.limbs).map(([k, v]) => `${k}:${v.toFixed(0)}`).join(' | ');
        document.getElementById('stat-monitor').innerHTML = `
            <b>肢体:</b> ${limbs}<br>
            <b>体力:</b> ${s.stamina}/200 | <b>精力:</b> ${s.energy}/100<br>
            <b>饱食:</b> ${s.fullness.toFixed(1)} | <b>饮水:</b> ${s.hydration.toFixed(1)}<br>
            <b>疲劳:</b> ${s.fatigue.toFixed(1)} | <b>内力:</b> ${s.qi}
        `;
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
        if (c.type !== 'null' && c.acts) {
            ctxSec.classList.remove('hidden');
            ctxOpts.innerHTML = `<p style="font-size:11px;color:#999;margin-bottom:5px">${c.fn}</p>`;
            c.acts.forEach(a => {
                const b = document.createElement('button'); b.className = "menu-btn"; b.innerText = a.label;
                b.onclick = () => { this.run(a.cmd); this.render(); };
                ctxOpts.appendChild(b);
            });
        } else ctxSec.classList.add('hidden');
    },

    dist(a, b) { return Math.abs(Math.floor(a/16)-Math.floor(b/16)) + Math.abs(a%16-b%16); },

    run(cmds) {
        cmds.forEach(c => {
            if (c.type === 'log') this.log(c.val);
            if (c.type === 'move') this.loadScene(c.target);
            if (c.type === 'hp') { // 恢复生命指令
                Object.keys(this.state.limbs).forEach(l => {
                    this.state.limbs[l] = Math.min(this.state.maxLimbs[l], this.state.limbs[l] + c.val);
                });
            }
            if (c.type === 'sleep') {
                this.advanceTime(480);
                this.state.fatigue = Math.max(0, this.state.fatigue - 60);
                this.run([{type:'hp', val: 20}]);
                this.log("<b>这一觉睡得很沉，感觉气血恢复了许多。</b>");
            }
        });
    },
    log(txt) {
        const e = document.createElement('div'); e.className = 'log'; e.innerHTML = txt;
        document.getElementById('log-content').appendChild(e);
        document.getElementById('log-console').scrollTop = 99999;
    }
};
window.onload = () => Engine.init();