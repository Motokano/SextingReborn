const game = {
    db: null,
    currentScene: null,
    playerIndex: 0,
    state: { flags: {} }, // 全局状态/旗标

    async init() {
        try {
            const resp = await fetch('data.json?v=' + Date.now());
            this.db = await resp.json();
            this.initResizer();
            this.loadScene("forest_center");
        } catch (err) { console.error("初始化错误:", err); }
    },

    loadScene(id) {
        if (!this.db.scenes[id]) return;
        this.currentScene = JSON.parse(JSON.stringify(this.db.scenes[id]));
        this.playerIndex = this.currentScene.grid.findIndex(c => c.type === 'player');
        this.render();
        this.log(`<b>[环境]</b> 载入新区域：${this.currentScene.location}`, "highlight");
    },

    render() {
        const grid = document.getElementById('action-grid');
        grid.style.setProperty('--cols', this.currentScene.cols || 4);
        grid.style.setProperty('--rows', this.currentScene.rows || 4);
        document.getElementById('loc-display').innerText = this.currentScene.location;
        document.getElementById('scene-desc').innerText = this.currentScene.description;
        grid.innerHTML = "";

        this.currentScene.grid.forEach((cell, index) => {
            const btn = document.createElement('button');
            const isPlayerHere = (index === this.playerIndex);
            btn.className = `action-btn type-${cell.type}`;
            if (cell.hidden) btn.classList.add('is-hidden');
            if (isPlayerHere) btn.classList.add('player-present');

            if (isPlayerHere) {
                btn.innerHTML = "<b style='color:#b08d57'>我</b>";
            } else if (!cell.hidden && cell.type !== 'empty') {
                btn.innerText = cell.shortName || "";
            }

            btn.onclick = () => this.handleCellClick(index);
            grid.appendChild(btn);
        });
    },

    handleCellClick(index) {
        const cell = this.currentScene.grid[index];
        const dist = this.getDist(this.playerIndex, index);

        if (dist === 0) { // 点击当前格：开启交互
            this.openMenu(cell);
        } else if (dist === 1) { // 移动
            this.playerIndex = index;
            if (cell.hidden) cell.hidden = false;
            this.render();
            if (cell.type !== 'empty') this.openMenu(cell);
            else document.getElementById('side-menu').classList.add('hidden');
        } else {
            this.log("目标超出了目前的步伐限制。");
        }
    },

    getDist(i1, i2) {
        const c = this.currentScene.cols;
        return Math.abs(Math.floor(i1/c) - Math.floor(i2/c)) + Math.abs(i1%c - i2%c);
    },

    openMenu(cell) {
        const menu = document.getElementById('side-menu');
        const opts = document.getElementById('menu-options');
        menu.classList.remove('hidden');
        opts.innerHTML = `<div style="font-size:11px; color:#999; margin-bottom:8px">${cell.fullName || "当前位置"}</div>`;

        // 加载玩家系统菜单或物体交互菜单
        const interactionList = (cell.type === 'player') ? this.db.systemActions : cell.interactions;

        if (interactionList) {
            interactionList.forEach(act => {
                // 检查条件：如果 JSON 包含 once 且 flag 已存在，则不显示
                if (act.once && this.state.flags[act.once]) return;

                const btn = document.createElement('button');
                btn.className = "menu-btn";
                btn.innerText = act.label;
                btn.onclick = () => this.executeAction(act);
                opts.appendChild(btn);
            });
        }

        const closeBtn = document.createElement('button');
        closeBtn.className = "menu-btn";
        closeBtn.style.marginTop = "10px";
        closeBtn.innerText = "取消";
        closeBtn.onclick = () => menu.classList.add('hidden');
        opts.appendChild(closeBtn);
    },

    // 核心指令处理器
    executeAction(action) {
        if (action.effects) {
            action.effects.forEach(eff => {
                switch(eff.type) {
                    case "log": this.log(eff.content, eff.class); break;
                    case "change_scene": this.loadScene(eff.target); break;
                    case "set_flag": this.state.flags[eff.key] = true; break;
                    case "faint": this.runFaintEffect(eff.duration || 5000); break;
                }
            });
        }
        this.render();
    },

    runFaintEffect(ms) {
        const app = document.getElementById('game-app');
        app.classList.add('is-fainted'); // 触发全黑渐变
        setTimeout(() => {
            app.classList.remove('is-fainted'); // 5秒后恢复
            this.log("<b>[系统重启]</b> 意识流重新建立，视觉传感器已恢复...", "highlight");
        }, ms);
    },

    log(msg, cls = "") {
        const d = document.createElement('div');
        d.className = `log-entry ${cls}`;
        d.innerHTML = msg;
        const c = document.getElementById('log-content');
        c.appendChild(d);
        document.getElementById('log-console').scrollTop = c.scrollHeight;
    },

    initResizer() {
        const resizer = document.getElementById('log-resizer');
        const consoleEl = document.getElementById('log-console');
        let isResizing = false;
        resizer.addEventListener('mousedown', () => isResizing = true);
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const h = window.innerHeight - e.clientY;
            if (h > 50 && h < window.innerHeight * 0.7) consoleEl.style.height = h + 'px';
        });
        document.addEventListener('mouseup', () => isResizing = false);
    }
};
window.onload = () => game.init();
