const UI = {
    renderMenu(containerId, actions, fullName) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = `<p style="font-size:11px;color:#999;margin-bottom:8px">${fullName || ""}</p>`;
        if (!actions || actions.length === 0) return;

        const brickContainer = document.createElement('div');
        brickContainer.className = 'action-brick-container';

        actions.forEach(actionOrId => {
            const isId = typeof actionOrId === 'string';
            const act = isId ? Engine.db.actions[actionOrId] : actionOrId;

            if (!act || !act.label) return;

            const btn = document.createElement('button');
            btn.className = "action-brick";
            btn.innerText = act.label;

            if (isId && act.repeatable === false && Engine.flags[actionOrId]) {
                btn.classList.add('disabled');
                btn.disabled = true;
            } else {
                btn.onclick = () => {
                    Engine.performAction(actionOrId);
                };
            }
            brickContainer.appendChild(btn);
        });
        container.appendChild(brickContainer);
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

    renderInventory(state) {
        const container = document.getElementById('inventory-list');
        const weightDisplay = document.getElementById('inventory-weight');
        if (!container || !weightDisplay) return;

        weightDisplay.innerText = `${state.current_weight.toFixed(1)}/${state.max_weight}kg`;
        container.innerHTML = "";

        const inventory = state.inventory || {};
        if (Object.keys(inventory).length === 0) {
            container.innerHTML = `<p style="font-size:12px;color:#999; text-align:center; width:100%;">空</p>`;
            return;
        }

        Object.entries(inventory).forEach(([itemId, count]) => {
            const item = (Engine.db.objects && Engine.db.objects[itemId]) || (Engine.db.items && Engine.db.items[itemId]);
            if (!item) return;

            const btn = document.createElement('button');
            btn.className = "action-brick";
            
            let countBadge = count > 1 ? `<span style="font-size:10px;color:#888;position:absolute;right:4px;bottom:2px;">x${count}</span>` : '';
            btn.innerHTML = `${item.sn}${countBadge}`;
            btn.style.position = 'relative';

            btn.onclick = () => {
                Engine.showItemActions(itemId);
            };

            container.appendChild(btn);
        });
    },

    showSleepModal(callback) {
        const modal = document.getElementById('sleep-modal');
        const slider = document.getElementById('sleep-slider');
        const display = document.getElementById('sleep-duration-display');
        const confirmBtn = document.getElementById('sleep-confirm-btn');
        const cancelBtn = document.getElementById('sleep-cancel-btn');

        const updateDisplay = () => {
            display.textContent = parseFloat(slider.value).toFixed(1);
        };

        const cleanup = () => {
            modal.classList.add('hidden');
            slider.removeEventListener('input', sliderListener);
            confirmBtn.removeEventListener('click', confirmListener);
            cancelBtn.removeEventListener('click', cancelListener);
            document.removeEventListener('keydown', esckeyListener);
        };

        const sliderListener = () => updateDisplay();
        const confirmListener = () => {
            cleanup();
            callback(parseFloat(slider.value));
        };
        const cancelListener = () => {
            cleanup();
            Engine.log("你取消了休息。");
        };
        const esckeyListener = (e) => {
            if (e.key === "Escape") {
                cancelListener();
            }
        };
        
        slider.value = 8;
        updateDisplay();
        
        slider.addEventListener('input', sliderListener);
        confirmBtn.addEventListener('click', confirmListener);
        cancelBtn.addEventListener('click', cancelListener);
        document.addEventListener('keydown', esckeyListener);

        modal.classList.remove('hidden');
    },

    showChoiceModal(title, options, callback) {
        const modal = document.getElementById('choice-modal');
        const titleEl = document.getElementById('choice-modal-title');
        const optionsContainer = document.getElementById('choice-options');
        const cancelBtn = document.getElementById('choice-cancel-btn');

        titleEl.innerText = title;
        optionsContainer.innerHTML = '';

        const cleanup = () => {
            modal.classList.add('hidden');
            cancelBtn.removeEventListener('click', cancelListener);
            document.removeEventListener('keydown', esckeyListener);
        };

        const cancelListener = () => {
            cleanup();
            Engine.log("你取消了选择。");
        };

        const esckeyListener = (e) => {
            if (e.key === "Escape") {
                cancelListener();
            }
        };

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'action-brick';
            btn.innerText = opt.text;
            btn.onclick = () => {
                cleanup();
                callback(opt.key);
            };
            optionsContainer.appendChild(btn);
        });
        
        cancelBtn.addEventListener('click', cancelListener);
        document.addEventListener('keydown', esckeyListener);

        modal.classList.remove('hidden');
    },

    showStorageModal(containerObject) {
        const modal = document.getElementById('storage-modal');
        const closeBtn = document.getElementById('storage-close-btn');
        const containerContent = document.getElementById('storage-container-content');
        const playerContent = document.getElementById('storage-player-content');
        if(!modal || !closeBtn || !containerContent || !playerContent) return;

        const renderColumn = (element, inventory, type) => {
            element.innerHTML = '';
            if (Object.keys(inventory).length === 0) {
                element.innerHTML = `<p style="font-size:12px;color:#999; text-align:center;">空</p>`;
                return;
            }

            Object.entries(inventory).forEach(([itemId, count]) => {
                const item = (Engine.db.objects && Engine.db.objects[itemId]) || (Engine.db.items && Engine.db.items[itemId]);
                if (!item) return;

                const btn = document.createElement('button');
                btn.className = "action-brick";
                
                let countBadge = count > 1 ? `x${count}` : '';
                btn.innerHTML = `${item.sn} <span style="font-size:10px;color:#888;">${countBadge}</span>`;

                btn.onclick = () => {
                    const command = {
                        item_id: itemId,
                        count: 1,
                        container_id: containerObject.id // Assumes containerObject has a unique ID
                    };
                    if (type === 'player') {
                        command.type = 'move_item_to_container';
                    } else {
                        command.type = 'move_item_from_container';
                    }
                    Engine.run([command]);
                    refresh(); // Re-render the modal content
                };
                element.appendChild(btn);
            });
        };

        const refresh = () => {
            renderColumn(containerContent, containerObject.inventory, 'container');
            renderColumn(playerContent, Engine.state.inventory, 'player');
            // Also refresh the main inventory UI in the background
            UI.renderInventory(Engine.state);
        };

        const cleanup = () => {
            modal.classList.add('hidden');
            closeBtn.removeEventListener('click', cleanup);
            document.removeEventListener('keydown', esckeyListener);
        };

        const esckeyListener = (e) => {
            if (e.key === "Escape") {
                cleanup();
            }
        };

        closeBtn.addEventListener('click', cleanup);
        document.addEventListener('keydown', esckeyListener);
        
        refresh();
        modal.classList.remove('hidden');
    },

    updateStatus(time, sceneName) {
        const tEl = document.getElementById('time-display');
        const lEl = document.getElementById('loc-display');
        if (tEl) tEl.innerText = `${time.month}月${time.day}日 ${time.hour.toString().padStart(2, '0')}:${time.minute.toString().padStart(2, '0')}`;
        if (lEl) lEl.innerText = sceneName;
    },

    popoutWindows: { log: null, info: null }
};

document.addEventListener('DOMContentLoaded', () => {
    // Inventory Toggle
    const inventoryToggle = document.getElementById('inventory-toggle');
    const inventoryContainer = document.getElementById('inventory-container');
    if (inventoryToggle && inventoryContainer) {
        inventoryToggle.addEventListener('click', () => {
            inventoryContainer.classList.toggle('expanded');
        });
    }

    // Panel Resizing Logic
    const initResizer = (resizerEl, panelEl, direction) => {
        if (!resizerEl || !panelEl) return;
        resizerEl.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = panelEl.offsetWidth;
            const startHeight = panelEl.offsetHeight;
            const doDrag = (e) => {
                if (direction === 'horizontal') {
                    const newWidth = startWidth - (e.clientX - startX);
                    const newWidthPercent = (newWidth / window.innerWidth) * 100;
                    document.documentElement.style.setProperty('--info-panel-width', `${newWidthPercent}%`);
                    document.body.classList.add('dragging');
                } else {
                    const newHeight = startHeight - (e.clientY - startY);
                    const newHeightPercent = (newHeight / window.innerHeight) * 100;
                    document.documentElement.style.setProperty('--log-panel-height', `${newHeightPercent}%`);
                    document.body.classList.add('dragging-v');
                }
            };
            const stopDrag = () => {
                window.removeEventListener('mousemove', doDrag, false);
                window.removeEventListener('mouseup', stopDrag, false);
                document.body.classList.remove('dragging', 'dragging-v');
            };
            window.addEventListener('mousemove', doDrag, false);
            window.addEventListener('mouseup', stopDrag, false);
        });
    };

    initResizer(document.getElementById('info-panel-resizer'), document.getElementById('info-panel'), 'horizontal');
    initResizer(document.getElementById('log-panel-resizer'), document.getElementById('log-panel'), 'vertical');

    // Popout for interactive panels (moves content node)
    const initContentMovePopout = (btnId, panelId, contentId) => {
        const popoutBtn = document.getElementById(btnId);
        const panel = document.getElementById(panelId);
        const content = document.getElementById(contentId);
        if (!popoutBtn || !panel || !content) return;

        const originalParent = content.parentElement;
        popoutBtn.addEventListener('click', () => {
            if (UI.popoutWindows.info && !UI.popoutWindows.info.closed) {
                UI.popoutWindows.info.focus();
                return;
            }
            UI.popoutWindows.info = window.open('', '', 'width=400,height=600,scrollbars=yes,resizable=yes');
            if (!UI.popoutWindows.info) return alert('Please allow pop-ups for this site.');
            
            Array.from(document.styleSheets).forEach(styleSheet => {
                const link = UI.popoutWindows.info.document.createElement('link');
                link.rel = 'stylesheet';
                link.href = styleSheet.href;
                UI.popoutWindows.info.document.head.appendChild(link);
            });
            
            UI.popoutWindows.info.document.body.appendChild(content);
            UI.popoutWindows.info.document.body.style.padding = '10px';
            UI.popoutWindows.info.document.title = `${panel.querySelector('.panel-header span').innerText} - Pop-out`;
            panel.style.display = 'none';

            UI.popoutWindows.info.addEventListener('beforeunload', () => {
                originalParent.appendChild(content);
                panel.style.display = 'flex';
                UI.popoutWindows.info = null;
            });
        });
    };

    // Popout for log panel (copies content, doesn't move node)
    const initLogPopout = () => {
        const popoutBtn = document.getElementById('log-panel-popout-btn');
        const panel = document.getElementById('log-panel');
        const content = document.getElementById('log-content');
        if (!popoutBtn || !panel || !content) return;

        popoutBtn.addEventListener('click', () => {
            if (UI.popoutWindows.log && !UI.popoutWindows.log.closed) {
                UI.popoutWindows.log.focus();
                return;
            }
            UI.popoutWindows.log = window.open('', '', 'width=500,height=700,scrollbars=yes,resizable=yes');
            if (!UI.popoutWindows.log) return alert('Please allow pop-ups for this site.');
            
            const popoutDoc = UI.popoutWindows.log.document;
            Array.from(document.styleSheets).forEach(styleSheet => {
                const link = popoutDoc.createElement('link');
                link.rel = 'stylesheet';
                link.href = styleSheet.href;
                popoutDoc.head.appendChild(link);
            });
            
            popoutDoc.body.innerHTML = content.innerHTML;
            popoutDoc.body.style.padding = '10px';
            popoutDoc.body.style.background = '#fff';
            popoutDoc.body.style.color = '#333';
            popoutDoc.title = `日志 - Pop-out`;
            panel.style.display = 'none';

            UI.popoutWindows.log.addEventListener('beforeunload', () => {
                panel.style.display = 'flex';
                UI.popoutWindows.log = null;
            });
        });
    };

    initContentMovePopout('info-panel-popout-btn', 'info-panel', 'info-panel-content');
    initLogPopout();
});
