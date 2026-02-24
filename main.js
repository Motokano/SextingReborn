const Engine = {
    db: null, cur: null, pIdx: 0, flags: {}, hp: 10, maxHp: 10,
    time: { month: 2, day: 24, hour: 8, minute: 0 },

    async init() {
        const r = await fetch('data.json?v=' + Date.now());
        this.db = await r.json();
        this.setupResizer();
        this.load(this.db.startScene);
    },

    load(id) {
        this.cur = JSON.parse(JSON.stringify(this.db.scenes[id]));
        const f = this.cur.grid.findIndex(c => c.type === 'player');
        if (f !== -1) this.pIdx = f;
        this.render();
        this.log(`<b>[环境]</b> 抵达了：${this.cur.name}`);
    },

    // 时间推进逻辑
    advanceTime(mins) {
        this.time.minute += mins;
        while (this.time.minute >= 60) { this.time.minute -= 60; this.time.hour++; }
        while (this.time.hour >= 24) { this.time.hour -= 24; this.time.day++; }
        
        // 视觉昼夜切换 (19:00 - 06:00 为夜)
        const app = document.getElementById('game-app');
        if (this.time.hour >= 19 || this.time.hour < 6) app.classList.add('night');
        else app.classList.remove('night');
        
        this.renderStatus();
    },

    renderStatus() {
        const t = this.time;
        const timeStr = `${t.month}月${t.day}日 ${t.hour.toString().padStart(2, '0')}:${t.minute.toString().padStart(2, '0')}`;
        document.getElementById('time-display').innerText = timeStr;
        document.getElementById('loc-display').innerText = this.cur.name;
    },

    render() {
        this.renderStatus();
        const g = document.getElementById('action-grid');
        g.style.setProperty('--cols', this.cur.cols);
        document.getElementById('scene-desc').innerText = this.cur.desc;
        g.innerHTML = "";

        // 伤重视觉反馈
        const app = document.getElementById('game-app');
        if (this.hp <= 3) app.classList.add('weakened');
        else app.classList.remove('weakened');

        this.cur.grid.forEach((c, i) => {
            const b = document.createElement('div');
            const isP = (i === this.pIdx);
            b.className = `btn ${c.type} ${c.hide ? 'hide' : ''} ${isP ? 'player' : ''}`;
            
            // 文字渲染：仅当前索引显示“我”，其余格子显示缩略名
            if (isP) b.innerText = "我";
            else if (!c.hide && c.type !== 'null') b.innerText = c.sn || "";
            
            b.onclick = () => this.click(i);
            g.appendChild(b);
        });
    },

    click(i) {
        const c = this.cur.grid[i], d = this.dist(this.pIdx, i);
        if (d === 0) {
            this.menu(c);
        } else if (d === 1) {
            this.pIdx = i;
            if (c.hide) c.hide = false;
            
            this.advanceTime(10); // 移动消耗10分钟
            
            if (c.type !== 'null') this.log(`你走向了 <b>${c.fn || c.sn}</b>。`);
            
            // 检查碰撞（被动触发）
            if (c.onStep) this.run(c.onStep);
            
            this.render();
            if (c.type !== 'null') this.menu(c);
            else document.getElementById('side-menu').classList.add('hidden');
        }
    },

    dist(a, b) {
        const w = this.cur.cols;
        return Math.abs(Math.floor(a/w)-Math.floor(b/w)) + Math.abs(a%w-b%w);
    },

    menu(c) {
        const m = document.getElementById('side-menu'), o = document.getElementById('menu-options');
        m.classList.remove('hidden');
        o.innerHTML = `<p style="font-size:12px;color:#999;margin-bottom:8px">${c.fn || "当前位置"}</p>`;
        
        // 区分“我”和物体的交互
        const isSelf = (this.cur.grid[this.pIdx].type === 'player' && c.type === 'player');
        const acts = isSelf ? this.db.sys_acts : (c.acts || []);
        
        acts.forEach(a => {
            // 判定1：时间窗口
            if (!this.checkTime(a)) return;
            // 判定2：是否单次触发
            if (!a.repeatable && this.flags[a.label]) return;

            const b = document.createElement('button');
            b.className = "menu-btn";
            b.innerText = a.label;
            b.onclick = () => {
                this.advanceTime(10); // 互动消耗10分钟
                this.flags[a.label] = true;
                this.run(a.cmd);
                m.classList.add('hidden');
            };
            o.appendChild(b);
        });

        const cl = document.createElement('button'); cl.className="menu-btn"; cl.innerText="取消操作";
        cl.style.marginTop = "10px"; cl.style.opacity = "0.5";
        cl.onclick = () => m.classList.add('hidden'); o.appendChild(cl);
    },

    checkTime(a) {
        if (!a.startTime || !a.endTime) return true;
        const now = this.time.hour * 60 + this.time.minute;
        const [sh, sm] = a.startTime.split(':').map(Number);
        const [eh, em] = a.endTime.split(':').map(Number);
        const start = sh * 60 + sm, end = eh * 60 + em;
        return (start <= end) ? (now >= start && now <= end) : (now >= start || now <= end);
    },

    run(cmds) {
        cmds.forEach(c => {
            if (c.type === 'log') this.log(c.val);
            if (c.type === 'faint') this.faint(c.ms || 5000);
            if (c.type === 'move') this.load(c.target);
            if (c.type === 'hp') {
                this.hp = Math.max(0, Math.min(this.maxHp, this.hp + c.val));
                if (c.val < 0) this.flash();
                if (this.hp === 0) this.faint(8000);
            }
            if (c.type === 'check_body') this.log(`<b>[感知]</b> ${this.getSensation()}`);
        });
        this.render();
    },

    getSensation() {
        const r = this.hp / this.maxHp;
        if (r >= 1) return "你感到呼吸平稳，四肢充实，状态很好。";
        if (r > 0.6) return "身体隐约有些酸痛，但这只是长途跋涉的代价。";
        if (r > 0.3) return "呼吸变得浑浊，每走一步都要耗费极大的毅力。";
        return "意识正在涣散，眼前的世界在剧烈摇晃，你随时可能倒下。";
    },

    flash() {
        const a = document.getElementById('game-app');
        a.classList.add('damage-flash');
        setTimeout(() => a.classList.remove('damage-flash'), 150);
    },

    faint(ms) {
        const app = document.getElementById('game-app');
        app.classList.add('faint');
        this.advanceTime(240); // 昏迷跳过4小时
        setTimeout(() => { 
            app.classList.remove('faint'); 
            this.hp = Math.max(this.hp, 2); 
            this.log("你在剧烈的头痛中慢慢睁开了眼。");
            this.render();
        }, ms);
    },

    log(txt) {
        const e = document.createElement('div'); e.className = 'log'; e.innerHTML = txt;
        const c = document.getElementById('log-content'); c.appendChild(e);
        document.getElementById('log-console').scrollTop = c.scrollHeight;
    },

    setupResizer() {
        let active = false;
        const r = document.getElementById('log-resizer'), c = document.getElementById('log-console');
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