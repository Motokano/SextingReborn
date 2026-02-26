const UI = {
    COMBAT_SKILL_SLOT: { basic_sword: '剑法' },

    renderMenu(containerId, actions, fullName) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = `<p class="menu-hint">${fullName || ""}</p>`;
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

    degreeFullness(v) {
        if (v >= 80) return "腹中饱满";
        if (v >= 60) return "尚可";
        if (v >= 40) return "略有饥意";
        if (v >= 20) return "饥肠辘辘";
        return "腹中空空";
    },
    degreeHydration(v) {
        if (v >= 80) return "口不干";
        if (v >= 60) return "尚可";
        if (v >= 40) return "略渴";
        if (v >= 20) return "口干舌燥";
        return "滴水未进";
    },
    degreeEnergy(v, max) {
        const pct = max > 0 ? (v / max) * 100 : 0;
        if (pct >= 80) return "精神饱满";
        if (pct >= 60) return "尚可";
        if (pct >= 40) return "有些疲惫";
        if (pct >= 20) return "疲惫不堪";
        return "难以为继";
    },
    degreeFatigue(v) {
        if (v <= 20) return "神清气爽";
        if (v <= 40) return "尚可";
        if (v <= 60) return "有些困倦";
        if (v <= 80) return "困顿不堪";
        return "难以支撑";
    },
    renderStats(state) {
        const el = document.getElementById('stat-monitor');
        const titleEl = document.getElementById('self-view-title');
        if (!el) return;
        const full = state.fullness != null ? state.fullness : 100;
        const hyd = state.hydration != null ? state.hydration : 100;
        const energy = state.energy != null ? state.energy : 100;
        const energyMax = state.energy_max != null ? state.energy_max : 100;
        const fatigue = state.fatigue != null ? state.fatigue : 0;

        if (titleEl) titleEl.textContent = '当前状态';
        const survivalBlock = `
            <div style="line-height:1.8; color:var(--text);">
                <div>饱食：${UI.degreeFullness(full)}</div>
                <div>饮水：${UI.degreeHydration(hyd)}</div>
                <div>精力：${UI.degreeEnergy(energy, energyMax)}</div>
                <div>疲劳：${UI.degreeFatigue(fatigue)}</div>
            </div>
            <p class="panel-hint">留意饱食与休息。</p>
        `;
        el.innerHTML = survivalBlock;

        const skillContainer = document.getElementById('skill-categories-container');
        const skillSection = document.getElementById('skill-section');
        const hasSurvival = Object.keys(state.survival_skills || {}).length > 0;
        const hasProduction = Object.keys(state.production_skills || {}).length > 0;
        const hasSupport = Object.keys(state.support_skills || {}).length > 0;
        const hasAnySkill = hasSurvival || hasProduction || hasSupport;
        if (skillSection) skillSection.style.display = hasAnySkill ? '' : 'none';
        if (skillContainer && hasAnySkill) {
            const parts = [];
            if (hasSurvival) parts.push('<div class="skill-cat"><div class="sub-title">生存技能</div>' + UI.renderCategorySkillBar(state.survival_skills, UI.survivalSkillName) + '</div>');
            if (hasProduction) parts.push('<div class="skill-cat"><div class="sub-title">生产技能</div>' + UI.renderCategorySkillBar(state.production_skills, UI.productionSkillName) + '</div>');
            if (hasSupport) parts.push('<div class="skill-cat"><div class="sub-title">辅助技能</div>' + UI.renderCategorySkillBar(state.support_skills, UI.supportSkillName) + '</div>');
            skillContainer.innerHTML = parts.join('');
        }

        const combatSection = document.getElementById('combat-section');
        const combatContainer = document.getElementById('combat-slots-container');
        const hasCombat = Engine.hasCombatAwareness(state);
        if (combatSection) combatSection.style.display = hasCombat ? '' : 'none';
        if (combatContainer && hasCombat) {
            UI.renderCombatSlots(combatContainer, state);
        }
    },

    survivalSkillName(id) { const n = { breathing: '呼吸' }; return n[id] || id; },
    productionSkillName(id) { const n = { mining: '挖矿' }; return n[id] || id; },
    supportSkillName(id) { const n = { probe: '探查' }; return n[id] || id; },
    skillName(skillId) {
        const names = { basic_sword: '基本剑法' };
        return names[skillId] || skillId;
    },
    renderCategorySkillBar(skillsObj, nameFn) {
        const skills = skillsObj || {};
        const lines = Object.entries(skills).map(([id, prog]) => {
            const level = prog && prog.level != null ? prog.level : 1;
            const levelMax = prog && prog.level_max != null ? prog.level_max : 100;
            const name = nameFn ? nameFn(id) : id;
            const degree = UI.skillDegree(level, levelMax, prog && prog.proficiency);
            return `<div style="line-height:1.6;">${name} ${degree}</div>`;
        });
        return lines.length ? lines.join('') : '<p style="font-size:12px;color:#999;">暂无</p>';
    },
    renderCombatSkillBar(state) {
        return UI.renderSkillBar(state);
    },
    renderCombatSlots(container, state) {
        if (!container) return;
        const slots = state.combat_skill_slots || {};
        const progress = state.combat_skill_progress || {};
        const slotOrder = ['剑法', '刀法', '暗器', '枪法', '掌法', '拳法', '腿法', '棍法', '指法', '身法', '内功', '招架'];
        container.innerHTML = '';
        slotOrder.forEach(slotName => {
            const skillId = slots[slotName];
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'combat-slot-btn' + (skillId ? '' : ' combat-slot-empty');
            btn.setAttribute('data-slot', slotName);
            if (skillId) {
                const prog = progress[skillId];
                const level = prog && prog.level != null ? prog.level : 1;
                const levelMax = prog && prog.level_max != null ? prog.level_max : 500;
                const name = UI.skillName(skillId);
                const degree = UI.skillDegree(level, levelMax, prog && prog.proficiency);
                btn.innerHTML = `<span class="slot-name">${slotName}</span><span class="slot-skill">${name} ${degree}</span>`;
            } else {
                btn.innerHTML = `<span class="slot-name">${slotName}</span><span class="slot-empty">空</span>`;
            }
            btn.onclick = () => UI.showCombatSlotModal(slotName);
            container.appendChild(btn);
        });
    },
    showCombatSlotModal(slotName) {
        const state = Engine.state;
        const slots = state.combat_skill_slots || {};
        const progress = state.combat_skill_progress || {};
        const currentSkillId = slots[slotName] || null;
        const options = [];
        Object.entries(UI.COMBAT_SKILL_SLOT).forEach(([skillId, s]) => {
            if (s !== slotName) return;
            if (!progress[skillId]) return;
            const name = UI.skillName(skillId);
            options.push({ key: skillId, text: name + (currentSkillId === skillId ? ' (已装备)' : '') });
        });
        if (currentSkillId) options.push({ key: '__unequip__', text: '卸下' });
        if (options.length === 0) {
            Engine.log('该槽位暂无可装备的技能。');
            return;
        }
        UI.showChoiceModal(slotName + ' · 选择技能', options, (key) => {
            if (key === '__unequip__') {
                Engine.run([{ type: 'set_combat_skill', slot: slotName, skill_id: null }]);
                Engine.log(`已卸下${slotName}槽位的技能。`);
            } else {
                Engine.run([{ type: 'set_combat_skill', slot: slotName, skill_id: key }]);
                Engine.log(`已装备${UI.skillName(key)}至${slotName}。`);
            }
            Engine.render();
        }, 'combat-skill');
    },
    skillDegree(level, levelMax, proficiency) {
        if (level == null || levelMax == null) return '—';
        const pct = levelMax > 0 ? (level / levelMax) * 100 : 0;
        if (pct >= 95) return '化境';
        if (pct >= 70) return '大成';
        if (pct >= 40) return '小成';
        if (pct >= 15) return '略知一二';
        return '初学乍练';
    },
    renderSkillBar(state) {
        const slots = state.combat_skill_slots || {};
        const progress = state.combat_skill_progress || {};
        const slotOrder = ['剑法', '刀法', '暗器', '枪法', '掌法', '拳法', '腿法', '棍法', '指法', '身法', '内功', '招架'];
        const lines = [];
        slotOrder.forEach(slotName => {
            const skillId = slots[slotName];
            if (skillId) {
                const prog = progress[skillId];
                const level = prog && prog.level != null ? prog.level : 1;
                const levelMax = prog && prog.level_max != null ? prog.level_max : 500;
                const name = UI.skillName(skillId);
                const degree = UI.skillDegree(level, levelMax, prog && prog.proficiency);
                lines.push(`<div class="combat-slot" style="line-height:1.6;">${slotName}：${name} ${degree}</div>`);
            } else {
                lines.push(`<div class="combat-slot combat-slot-empty" style="line-height:1.6;">${slotName}：<span class="slot-empty">空</span></div>`);
            }
        });
        return lines.length ? lines.join('') : '<p style="font-size:12px;color:#999;">暂无槽位</p>';
    },

    renderGroundItems(cell) {
        const section = document.getElementById('ground-section');
        const container = document.getElementById('ground-items');
        const hint = document.getElementById('ground-slots-hint');
        const titleEl = document.getElementById('ground-section-title');
        if (!section || !container) return;
        const ground = (cell && cell.groundInventory) ? cell.groundInventory : {};
        const total = Object.values(ground).reduce((a, n) => a + n, 0);
        const maxSlots = Engine.GROUND_SLOTS || 8;
        const anyUnlocked = Engine.hasAnySkillCategoryUnlocked(Engine.state);
        if (titleEl) titleEl.textContent = anyUnlocked ? '地上的物品' : '眼前所见';
        if (hint) hint.textContent = anyUnlocked ? `(${total}/${maxSlots})` : '';
        container.innerHTML = '';
        if (total === 0) {
            container.innerHTML = '<p style="font-size:12px;color:#999;text-align:center;width:100%;">空</p>';
            return;
        }
        Object.entries(ground).forEach(([itemId, count]) => {
            const item = (Engine.db.objects && Engine.db.objects[itemId]) || (Engine.db.items && Engine.db.items[itemId]);
            if (!item) return;
            const btn = document.createElement('button');
            btn.className = 'action-brick';
            btn.innerHTML = count > 1 ? `${item.sn} x${count}<br><span style="font-size:10px;">捡起</span>` : `${item.sn}<br><span style="font-size:10px;">捡起</span>`;
            btn.onclick = () => {
                Engine.run([{ type: 'take_item_from_ground', item_id: itemId }]);
                Engine.render();
            };
            container.appendChild(btn);
        });
    },

    degreeWeight(current, max) {
        if (max <= 0) return "—";
        const pct = (current / max) * 100;
        if (pct >= 100) return "超重";
        if (pct >= 70) return "吃重";
        if (pct >= 40) return "尚可";
        return "无负担";
    },
    renderInventory(state) {
        const container = document.getElementById('inventory-list');
        const weightDisplay = document.getElementById('inventory-weight');
        if (!container || !weightDisplay) return;

        weightDisplay.innerText = UI.degreeWeight(state.current_weight || 0, state.max_weight || 65);
        container.innerHTML = "";

        const inventory = state.inventory || {};
        if (Object.keys(inventory).length === 0) {
            container.innerHTML = `<p style="font-size:12px;color:#999; text-align:center; width:100%;">空</p>`;
            return;
        }

        Object.entries(inventory).forEach(([itemId, count]) => {
            const baseId = Engine.getBaseItemId ? Engine.getBaseItemId(itemId) : itemId;
            const item = (Engine.db.objects && Engine.db.objects[baseId]) || (Engine.db.items && Engine.db.items[baseId]);
            if (!item) return;

            const btn = document.createElement('button');
            btn.className = "action-brick";
            let countBadge = count > 1 ? `<span style="font-size:10px;color:#888;position:absolute;right:4px;bottom:2px;">x${count}</span>` : '';
            btn.innerHTML = `${item.sn}${countBadge}`;
            btn.style.position = 'relative';
            btn.onclick = () => Engine.showItemActions(itemId);
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

    showChoiceModal(title, options, callback, layout) {
        const modal = document.getElementById('choice-modal');
        const titleEl = document.getElementById('choice-modal-title');
        const optionsContainer = document.getElementById('choice-options');
        const cancelBtn = document.getElementById('choice-cancel-btn');

        titleEl.innerText = title;
        const subtitleEl = document.getElementById('choice-modal-subtitle');
        if (subtitleEl) subtitleEl.textContent = layout === 'combat-skill' ? '选择要装备至此槽位的技能' : '';
        if (subtitleEl) subtitleEl.style.display = layout === 'combat-skill' ? '' : 'none';
        optionsContainer.innerHTML = '';
        optionsContainer.className = 'action-brick-container choice-options' + (layout === 'combat-skill' ? ' choice-options--list' : '');
        if (layout === 'combat-skill') modal.classList.add('choice-modal--combat');

        const cleanup = () => {
            modal.classList.add('hidden');
            modal.classList.remove('choice-modal--combat');
            cancelBtn.removeEventListener('click', cancelListener);
            document.removeEventListener('keydown', esckeyListener);
        };

        const cancelListener = () => {
            cleanup();
            Engine.log("你取消了选择。");
        };

        const esckeyListener = (e) => {
            if (e.key === "Escape") cancelListener();
        };

        const isList = layout === 'combat-skill';
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = isList ? 'choice-option-btn' : 'action-brick';
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

        const getBaseItemId = (key) => (key && /_\d+$/.test(key)) ? key.replace(/_\d+$/, '') : key;

        const renderColumn = (element, inventory, type) => {
            element.innerHTML = '';
            const keys = Object.keys(inventory);
            if (keys.length === 0) {
                const empty = document.createElement('li');
                empty.className = 'storage-list-empty';
                empty.textContent = '空';
                element.appendChild(empty);
                return;
            }

            keys.forEach((key) => {
                const count = inventory[key];
                const baseId = getBaseItemId(key);
                const item = (Engine.db.objects && Engine.db.objects[baseId]) || (Engine.db.items && Engine.db.items[baseId]);
                if (!item) return;

                const li = document.createElement('li');
                li.className = 'storage-list-row';
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'storage-list-btn';
                btn.textContent = count > 1 ? `${item.sn} ×${count}` : item.sn;
                btn.onclick = () => {
                    const cmd = { item_id: key, count: 1, container_id: containerObject.id };
                    if (type === 'player') cmd.type = 'move_item_to_container';
                    else cmd.type = 'move_item_from_container';
                    Engine.run([cmd]);
                    refresh();
                };
                li.appendChild(btn);
                element.appendChild(li);
            });
        };

        const refresh = () => {
            renderColumn(containerContent, containerObject.inventory, 'container');
            renderColumn(playerContent, Engine.state.inventory, 'player');
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
    // Panel toggles (secondary menu expand/collapse)
    document.querySelectorAll('.panel-toggle').forEach(btn => {
        const targetId = btn.getAttribute('data-target');
        const target = targetId ? document.getElementById(targetId) : null;
        const icon = btn.querySelector('.toggle-icon');
        if (!target) return;
        btn.addEventListener('click', () => {
            const isExpanded = target.classList.toggle('expanded');
            btn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
            if (icon) icon.textContent = isExpanded ? '▼' : '▶';
        });
    });

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
