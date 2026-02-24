const game = {
    db: null,
    currentScene: null,

    async init() {
        try {
            const resp = await fetch('data.json?v=' + Date.now());
            this.db = await resp.json();
            this.initResizer();
            this.loadScene("forest_center");
        } catch (err) {
            console.error("加载失败:", err);
            document.getElementById('scene-desc').innerText = "数据加载失败，请检查 data.json 格式。";
        }
    },

    loadScene(id) {
        if (!this.db.scenes[id]) return;
        this.currentScene = JSON.parse(JSON.stringify(this.db.scenes[id]));
        document.getElementById('side-menu').classList.add('hidden');
        this.render();
        this.log(`<b>[系统]</b> 进入区域：${this.currentScene.location}`, "system-msg");
    },

    render() {
        const scene = this.currentScene;
        const grid = document.getElementById('action-grid');
        
        // 设置行列变量
        grid.style.setProperty('--cols', scene.cols || 4);
        grid.style.setProperty('--rows', scene.rows || 4);
        
        document.getElementById('loc-display').innerText = scene.location;
        document.getElementById('scene-desc').innerText = scene.description;
        grid.innerHTML = "";

        scene.grid.forEach((cell, index) => {
            const btn = document.createElement('button');
            if (cell.hidden) {
                btn.className = "action-btn is-hidden";
                btn.onclick = () => this.revealCell(index);
            } else {
                btn.className = `action-btn type-${cell.type}`;
                btn.innerText = (cell.type === 'empty') ? "" : (cell.shortName || "");
                btn.onclick = () => {
                    // 1. 日志显示全名
                    if (cell.fullName) this.log(`你注意到了：<span class="highlight">${cell.fullName}</span>`);
                    // 2. 呼出右侧交互菜单
                    this.showInteractionMenu(cell);
                };
            }
            grid.appendChild(btn);
        });
    },

    revealCell(index) {
        const cell = this.currentScene.grid[index];
        cell.hidden = false;
        this.log(cell.type === 'empty' ? "前方空无一物。" : `迷雾散去，你看到了 <span class="highlight">${cell.fullName || cell.shortName}</span>。`);
        this.render();
    },

    showInteractionMenu(cell) {
        const menu = document.getElementById('side-menu');
        const options = document.getElementById('menu-options');
        
        menu.classList.remove('hidden');
        options.innerHTML = ""; 

        // 玩家特殊菜单
        if (cell.type === 'player') {
            const actions = [
                { label: "检查自身", log: "你闭上眼感受，后脑的连线接口隐隐作痛。" },
                { label: "整理背包", log: "包里只有那罐快过期的红牛和一些废铁。" }
            ];
            actions.forEach(act => this.createMenuBtn(options, act));
        } 
        // 场景物体菜单
        else if (cell.interactions) {
            cell.interactions.forEach(act => this.createMenuBtn(options, act));
        } else {
            options.innerHTML = "<div style='color:#444;font-size:12px'>没有可执行的操作</div>";
        }

        // 通用关闭按钮
        const closeBtn = document.createElement('button');
        closeBtn.className = "menu-btn";
        closeBtn.style.marginTop = "20px";
        closeBtn.innerText = "取消";
        closeBtn.onclick = () => menu.classList.add('hidden');
        options.appendChild(closeBtn);
    },

    createMenuBtn(parent, act) {
        const btn = document.createElement('button');
        btn.className = "menu-btn";
        btn.innerText = act.label;
        btn.onclick = () => {
            if (act.log) this.log(act.log);
            if (act.target) this.loadScene(act.target);
            // 可以在此处扩展更多效果 (如 addItem, damagePlayer 等)
        };
        parent.appendChild(btn);
    },

    log(msg, className = "") {
        const content = document.getElementById('log-content');
        const entry = document.createElement('div');
        entry.className = `log-entry ${className}`;
        entry.innerHTML = msg;
        content.appendChild(entry);
        document.getElementById('log-console').scrollTop = content.scrollHeight;
    },

    initResizer() {
        const resizer = document.getElementById('log-resizer');
        const consoleEl = document.getElementById('log-console');
        let isResizing = false;
        const start = () => isResizing = true;
        const stop = () => isResizing = false;
        resizer.addEventListener('mousedown', start);
        resizer.addEventListener('touchstart', start);
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const h = window.innerHeight - e.clientY;
            if (h > 50 && h < window.innerHeight * 0.8) consoleEl.style.height = h + 'px';
        });
        document.addEventListener('touchmove', (e) => {
            if (!isResizing) return;
            const h = window.innerHeight - e.touches[0].clientY;
            if (h > 50 && h < window.innerHeight * 0.8) consoleEl.style.height = h + 'px';
        });
        document.addEventListener('mouseup', stop);
        document.addEventListener('touchend', stop);
    }
};

window.onload = () => game.init();
