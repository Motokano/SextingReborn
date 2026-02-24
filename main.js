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
            console.error("初始化失败:", err);
            document.getElementById('scene-desc').innerText = "数据加载失败，请检查 data.json";
        }
    },

    loadScene(id) {
        if (!this.db.scenes[id]) return;
        this.currentScene = JSON.parse(JSON.stringify(this.db.scenes[id])); 
        this.toggleSideMenu(false); // 切换场景关闭菜单
        this.render();
        this.log(`到达：${this.currentScene.location}`, "system-msg");
    },

    render() {
        const scene = this.currentScene;
        const grid = document.getElementById('action-grid');
        grid.style.setProperty('--cols', scene.cols || 4);
        
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
                btn.innerHTML = (cell.type === 'empty') ? "" : (cell.name || "");
                btn.onclick = () => {
                    if (cell.type === 'player') this.toggleSideMenu(true);
                    else {
                        this.toggleSideMenu(false);
                        this.interact(cell);
                    }
                };
            }
            grid.appendChild(btn);
        });
    },

    revealCell(index) {
        const cell = this.currentScene.grid[index];
        cell.hidden = false;
        this.log(cell.type === 'empty' ? "前方是一片荒芜。" : `发现了：${cell.name}`);
        this.render();
    },

    interact(cell) {
        if (cell.type === 'empty') return;
        if (cell.log) this.log(cell.log);
        if (cell.type === 'exit' && cell.target) this.loadScene(cell.target);
    },

    toggleSideMenu(show) {
        const menu = document.getElementById('side-menu');
        const options = document.getElementById('menu-options');
        if (show) {
            menu.classList.remove('hidden');
            options.innerHTML = `
                <button class="menu-btn" onclick="game.action('check_self')">检查自身</button>
                <button class="menu-btn" onclick="game.action('check_bag')">检查背包</button>
                <button class="menu-btn" style="margin-top:10px; opacity:0.5" onclick="game.toggleSideMenu(false)">关闭</button>
            `;
        } else {
            menu.classList.add('hidden');
        }
    },

    action(type) {
        if (type === 'check_self') this.log("<b>[系统]</b> 身体尚可，但精神透支严重。", "system-msg");
        if (type === 'check_bag') this.log("<b>[系统]</b> 背包里只有那罐红牛。", "system-msg");
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
        const startResizing = () => isResizing = true;
        const stopResizing = () => isResizing = false;
        resizer.addEventListener('mousedown', startResizing);
        resizer.addEventListener('touchstart', startResizing);
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const h = window.innerHeight - e.clientY;
            if (h > 60 && h < window.innerHeight * 0.7) consoleEl.style.height = h + 'px';
        });
        document.addEventListener('touchmove', (e) => {
            if (!isResizing) return;
            const h = window.innerHeight - e.touches[0].clientY;
            if (h > 60 && h < window.innerHeight * 0.7) consoleEl.style.height = h + 'px';
        });
        document.addEventListener('mouseup', stopResizing);
        document.addEventListener('touchend', stopResizing);
    }
};
window.onload = () => game.init();
