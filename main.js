const game = {
    db: null,
    currentScene: null,
    unlockedActions: [],

    async init() {
        try {
            // 增加缓存刷新机制，防止读取旧的 JSON
            const resp = await fetch('data.json?v=' + Date.now());
            if (!resp.ok) throw new Error("无法获取 data.json");
            this.db = await resp.json();
            
            this.initResizer();
            this.loadScene("forest_wake");
            console.log("游戏初始化成功");
        } catch (err) {
            document.getElementById('scene-desc').innerHTML = "<span style='color:red'>初始化失败: 找不到 data.json 或格式错误</span>";
            console.error(err);
        }
    },

    loadScene(id) {
        if (!this.db.scenes[id]) return;
        this.currentScene = JSON.parse(JSON.stringify(this.db.scenes[id])); // 深拷贝
        this.unlockedActions = [];
        this.render();
        this.log(`到达了 ${this.currentScene.location}`, "system-msg");
    },

    render() {
        document.getElementById('loc-display').innerText = this.currentScene.location;
        document.getElementById('scene-desc').innerText = this.currentScene.description;
        
        const grid = document.getElementById('action-grid');
        grid.innerHTML = "";

        // 合并基础动作和解锁动作
        const allActions = [...this.currentScene.baseActions, ...this.unlockedActions];
        
        allActions.forEach(act => {
            const btn = document.createElement('button');
            btn.className = "action-btn";
            btn.innerText = act.text;
            btn.onclick = () => this.handleAction(act);
            grid.appendChild(btn);
        });
    },

    handleAction(act) {
        // 解锁逻辑
        if (act.type === 'explore' && this.currentScene.unlocks[act.id]) {
            const unlockData = this.currentScene.unlocks[act.id];
            this.log(`<b>四处张望:</b> ${act.log || "你观察了四周。"}`);
            
            // 更新场景并解锁新方块
            this.currentScene.description = unlockData.descUpdate;
            this.unlockedActions = [...this.unlockedActions, ...unlockData.newActions];
            
            // 移除已使用的探索按钮
            this.currentScene.baseActions = this.currentScene.baseActions.filter(a => a.id !== act.id);
            this.render();
        } 
        else {
            if (act.log) this.log(act.log);
            if (act.target) this.loadScene(act.target);
        }
    },

    log(msg, className = "") {
        const container = document.getElementById('log-content');
        const entry = document.createElement('div');
        entry.className = `log-entry ${className}`;
        entry.innerHTML = msg;
        container.appendChild(entry);
        document.getElementById('log-console').scrollTop = container.scrollHeight;
    },

    initResizer() {
        const resizer = document.getElementById('log-resizer');
        const consoleEl = document.getElementById('log-console');
        let isResizing = false;

        resizer.addEventListener('mousedown', () => isResizing = true);
        resizer.addEventListener('touchstart', () => isResizing = true);
        
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const h = window.innerHeight - e.clientY;
            if (h > 60 && h < window.innerHeight * 0.8) consoleEl.style.height = h + 'px';
        });

        document.addEventListener('touchmove', (e) => {
            if (!isResizing) return;
            const h = window.innerHeight - e.touches[0].clientY;
            if (h > 60 && h < window.innerHeight * 0.8) consoleEl.style.height = h + 'px';
        });

        document.addEventListener('mouseup', () => isResizing = false);
        document.addEventListener('touchend', () => isResizing = false);
    }
};

window.onload = () => game.init();
