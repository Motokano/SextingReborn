const game = {
    db: null,
    currentSceneData: null,
    unlockedActions: [], // 记录当前场景已解锁的额外动作

    async init() {
        const resp = await fetch('data.json');
        this.db = await resp.json();
        this.initResizer();
        this.loadScene("forest_wake");
    },

    loadScene(id) {
        this.currentSceneData = this.db.scenes[id];
        this.unlockedActions = []; // 切换场景重置解锁状态
        this.render();
        this.log(`<b>${this.currentSceneData.location}</b>`, "system");
    },

    render() {
        const scene = this.currentSceneData;
        document.getElementById('loc-display').innerText = scene.location;
        document.getElementById('scene-desc').innerHTML = scene.description;
        
        const grid = document.getElementById('action-grid');
        grid.innerHTML = "";

        // 渲染基础动作 + 已解锁的动作
        const allActions = [...scene.baseActions, ...this.unlockedActions];
        
        allActions.forEach(act => {
            const btn = document.createElement('button');
            btn.className = "action-btn new-action";
            btn.innerText = act.text;
            btn.onclick = () => this.handleAction(act);
            grid.appendChild(btn);
        });
    },

    handleAction(act) {
        // 1. 如果是“张望”探索类型
        if (act.type === 'explore' && this.currentSceneData.unlocks[act.id]) {
            const unlockData = this.currentSceneData.unlocks[act.id];
            this.log("你努力定睛看去...");
            
            // 更新场景描述并注入新动作
            this.currentSceneData.description = unlockData.descUpdate;
            this.unlockedActions = [...this.unlockedActions, ...unlockData.newActions];
            
            // 移除掉这个“张望”按钮（因为已经看过了）
            this.currentSceneData.baseActions = this.currentSceneData.baseActions.filter(a => a.id !== act.id);
            
            this.render();
            return;
        }

        // 2. 普通跳转或日志逻辑
        if (act.log) this.log(act.log);
        if (act.target) this.loadScene(act.target);
    },

    log(msg, type = "") {
        const container = document.getElementById('log-content');
        const div = document.createElement('div');
        div.className = `log-entry ${type}`;
        div.innerHTML = msg;
        container.appendChild(div);
        document.getElementById('log-console').scrollTop = container.scrollHeight;
    },

    initResizer() {
        // ... (保持之前的拉伸逻辑不变)
    }
};
