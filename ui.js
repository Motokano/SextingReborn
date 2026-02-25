const UI = {
    renderMenu(containerId, acts, fullName) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = `<p style="font-size:11px;color:#999;margin-bottom:8px">${fullName || ""}</p>`;
        if (!acts || acts.length === 0) return;

        acts.forEach(act => {
            const btn = document.createElement('button');
            btn.className = "menu-btn";
            btn.innerText = act.label;

            // --- 核心：可重复性与 Flag 判断 ---
            const actionId = act.id || act.label;
            const hasTriggered = Engine.flags[actionId];

            if (act.repeatable === false && hasTriggered) {
                // 不可重复且已触发 -> 置灰禁用
                btn.classList.add('disabled');
                btn.disabled = true;
                btn.innerText += " (已结束)";
            } else {
                btn.onclick = () => {
                    // 如果不可重复，点击时记录 Flag
                    if (act.repeatable === false) {
                        Engine.flags[actionId] = true;
                    }
                    Engine.run(act.cmd);
                };
            }
            container.appendChild(btn);
        });
    },

    renderStats(state) {
        const limbMap = { head: "头部", chest: "胸部", stomach: "腹部", l_arm: "左手", r_arm: "右手", l_leg: "左腿", r_leg: "右腿" };
        const limbs = Object.entries(state.limbs).map(([k, v]) => {
            const m = state.maxLimbs[k];
            const name = limbMap[k] || k;
            const c = v <= 0 ? '#7f8c8d' : (v < m * 0.4 ? '#e74c3c' : '#2c3e50');
            return `<span style="color:${c}; margin-right:10px; ${v<=0?'text-decoration:line-through':''}">${name}:${v.toFixed(0)}/${m}</span>`;
        }).join('');

        document.getElementById('stat-monitor').innerHTML = `
            <div style="margin-bottom:8px; line-height:1.6; display:flex; flex-wrap:wrap;">${limbs}</div>
            <div style="font-weight:bold; color:#7f8c8d; border-top:1px dashed #ddd; padding-top:5px">
                饱食:${state.fullness.toFixed(1)} | 饮水:${state.hydration.toFixed(1)} | 疲劳:${state.fatigue.toFixed(1)}
            </div>
        `;
    },

    updateStatus(time, sceneName) {
        const tEl = document.getElementById('time-display');
        const lEl = document.getElementById('loc-display');
        if (tEl) tEl.innerText = `${time.month}月${time.day}日 ${time.hour.toString().padStart(2, '0')}:${time.minute.toString().padStart(2, '0')}`;
        if (lEl) lEl.innerText = sceneName;
    }
};