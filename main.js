const game = {
    db: null,
    
    async init() {
        // 1. 加载解耦的场景数据
        const resp = await fetch('data.json');
        this.db = await resp.json();
        
        // 2. 绑定拉伸逻辑
        this.initResizer();
        
        // 3. 加载初始场景
        this.loadScene("forest_wake");
    },

    loadScene(id) {
        const scene = this.db.scenes[id];
        document.getElementById('loc-display').innerText = scene.location;
        document.getElementById('scene-desc').innerHTML = scene.description;
        
        const grid = document.getElementById('action-grid');
        grid.innerHTML = "";
        
        scene.actions.forEach(act => {
            const btn = document.createElement('button');
            btn.className = "action-btn"; // 样式请参照之前的定义
            btn.innerText = act.text;
            btn.onclick = () => this.handleAction(act);
            grid.appendChild(btn);
        });
        
        this.log(`进入了：${scene.location}`);
    },

    handleAction(act) {
        if (act.log) this.log(act.log);
        if (act.target) this.loadScene(act.target);
    },

    log(msg) {
        const container = document.getElementById('log-content');
        const div = document.createElement('div');
        div.className = "log-entry";
        div.innerHTML = msg;
        container.appendChild(div);
        document.getElementById('log-console').scrollTop = container.scrollHeight;
    },

    // 日志框拉伸逻辑
    initResizer() {
        const resizer = document.getElementById('log-resizer');
        const console = document.getElementById('log-console');
        let isResizing = false;

        resizer.addEventListener('mousedown', (e) => { isResizing = true; });
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const h = window.innerHeight - e.clientY;
            if (h > 100 && h < window.innerHeight * 0.8) {
                console.style.height = `${h}px`;
            }
        });
        document.addEventListener('mouseup', () => { isResizing = false; });
    }
};

window.onload = () => game.init();
