const game = {
    // ... init 等加载逻辑保持不变 ...

    loadScene(id) {
        if (!this.db.scenes[id]) return;
        // 使用深拷贝，防止迷雾揭开后无法重置（如果你需要存档功能的话）
        this.currentScene = JSON.parse(JSON.stringify(this.db.scenes[id])); 
        this.render();
        this.log(`<b>[系统] 意识已同步：${this.currentScene.location}</b>`, "system-msg");
    },

    render() {
        const scene = this.currentScene;
        const grid = document.getElementById('action-grid');
        
        // 关键：动态设置 CSS 变量
        grid.style.setProperty('--cols', scene.cols || 4);
        
        document.getElementById('loc-display').innerText = scene.location;
        document.getElementById('scene-desc').innerText = scene.description;
        
        grid.innerHTML = "";

        scene.grid.forEach((cell, index) => {
            const btn = document.createElement('button');
            
            // 如果是隐藏状态，添加迷雾类
            if (cell.hidden) {
                btn.className = "action-btn is-hidden";
                btn.onclick = () => this.revealCell(index);
            } else {
                btn.className = `action-btn type-${cell.type} reveal-anim`;
                btn.innerHTML = cell.type === 'empty' ? "" : cell.name;
                btn.onclick = () => this.interact(cell);
            }
            
            grid.appendChild(btn);
        });
    },

    // 揭开迷雾的逻辑
    revealCell(index) {
        const cell = this.currentScene.grid[index];
        cell.hidden = false; // 修改当前场景数据
        
        // 叙事反馈
        if (cell.type === 'empty') {
            this.log("你摸索了一番，这里除了一些碎石什么也没有。");
        } else {
            this.log(`你拨开了浓雾，发现了：<b>${cell.name}</b>`);
        }
        
        this.render(); // 重新渲染界面
    },

    interact(cell) {
        if (cell.type === 'empty') return;
        if (cell.log) this.log(cell.log);

        switch(cell.type) {
            case 'exit':
                this.loadScene(cell.target);
                break;
            case 'item':
                this.log(`你暂时收好了 [${cell.name}]。`);
                // 后续可在此添加进包逻辑
                break;
            // ... 其他交互逻辑
        }
    }
};
