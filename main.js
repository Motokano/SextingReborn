const game = {
    data: null, // 存储从 JSON 加载的数据
    currentScene: "forest_start",

    // 1. 初始化：加载 JSON
    async init() {
        try {
            const response = await fetch('data.json');
            this.data = await response.json();
            this.renderScene(this.currentScene);
        } catch (e) {
            console.error("加载游戏数据失败:", e);
        }
    },

    // 2. 核心：渲染场景
    renderScene(id) {
        const scene = this.data.scenes[id];
        this.currentScene = id;

        // 更新顶部标题
        document.getElementById('scene-header').innerText = scene.name;
        
        // 自动输出场景描述
        this.say(scene.description);

        // 清空旧按钮并生成新按钮
        const panel = document.getElementById('action-grid');
        panel.innerHTML = ""; 

        scene.actions.forEach(act => {
            const btn = document.createElement('button');
            btn.className = "action-btn";
            btn.innerText = act.text;
            
            // 点击逻辑
            btn.onclick = () => {
                if (act.target) {
                    this.renderScene(act.target); // 切换场景
                } else if (act.type === "status_check") {
                    this.say("你感到一阵强烈的虚脱感..."); // 状态检查逻辑
                }
            };
            panel.appendChild(btn);
        });
    },

    say(text) {
        const log = document.getElementById('story-log');
        const entry = document.createElement('div');
        entry.className = 'entry';
        entry.innerHTML = `<p>${text}</p>`;
        log.appendChild(entry);
        log.scrollTop = log.scrollHeight;
    }
};

window.onload = () => game.init();
