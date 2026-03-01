const UI = {
    COMBAT_SKILL_SLOT: {
        basic_sword: '剑法', basic_blade: '刀法', basic_throwing: '暗器', basic_spear: '枪法',
        basic_palm: '掌法', basic_fist: '拳法', basic_leg: '腿法', basic_staff: '棍法',
        basic_finger: '指法', basic_movement: '身法', basic_internal: '内功', basic_parry: '招架'
    },

    getOreMeta(itemId) {
        const mats = Engine.db.materials || {};
        return mats[itemId] || null;
    },

    getForageMeta(itemId) {
        const fm = Engine.db.forage || {};
        return fm[itemId] || null;
    },

    getItemDisplayName(itemId, state) {
        const baseId = (typeof InventoryUtils !== 'undefined' && InventoryUtils.getBaseItemId) ? InventoryUtils.getBaseItemId(itemId) : itemId;
        const obj = (Engine.db.objects && Engine.db.objects[baseId]) || (Engine.db.items && Engine.db.items[baseId]);
        let meta = UI.getOreMeta(baseId) || UI.getForageMeta(baseId);
        let name;
        if (!meta) {
            name = obj ? obj.sn : baseId;
        } else {
            const miningLv = (state && state.production_skills && state.production_skills.mining && state.production_skills.mining.level) || 0;
            const loggingLv = (state && state.production_skills && state.production_skills.logging && state.production_skills.logging.level) || 0;
            const gatheringLv = (state && state.survival_skills && state.survival_skills.gathering && state.survival_skills.gathering.level) || 0;
            const fishingLv = (state && state.survival_skills && state.survival_skills.fishing && state.survival_skills.fishing.level) || 0;
            const farmingLv = (state && state.production_skills && state.production_skills.farming && state.production_skills.farming.level) || 0;
            const huntingLv = (state && state.survival_skills && state.survival_skills.hunting && state.survival_skills.hunting.level) || 0;
            const basicAt = meta.reveal_basic_at || 999;
            const advAt = meta.reveal_advanced_at || 999;
            const tags = meta.tags || [];
            let lv = miningLv;
            if (tags.includes('forage')) lv = gatheringLv;
            else if (tags.includes('wood')) lv = loggingLv;
            else if (tags.includes('fish')) lv = fishingLv;
            else if (tags.includes('crop')) lv = farmingLv;
            else if (tags.includes('game')) lv = huntingLv;
            if (lv >= advAt && meta.sn_advanced) name = meta.sn_advanced;
            else if (lv >= basicAt && meta.sn_basic) name = meta.sn_basic;
            else name = meta.sn_unknown || (obj ? obj.sn : baseId);
        }
        if (obj && obj.tags && obj.tags.includes('seed')) {
            const farmingLv = (state && state.production_skills && state.production_skills.farming && state.production_skills.farming.level) || 0;
            if (farmingLv < 1) name = '未知种子';
        }
        const rawQ = (state && state.inventory_quality && state.inventory_quality[itemId] != null) ? state.inventory_quality[itemId] : (obj && obj.quality != null ? obj.quality : 1);
        const quality = (typeof InventoryUtils !== 'undefined' && InventoryUtils.clampQuality) ? InventoryUtils.clampQuality(rawQ) : Math.max(1, Math.min(6, Math.floor(Number(rawQ)) || 1));
        if (quality > 1) name = name + ' (品质' + quality + ')';
        return name;
    },

    getObjectDisplayName(ref, state) {
        if (!ref) return '';
        // 地块本身只展示朴素环境，不主动暴露可采集信息
        return ref.sn || '';
    },

    renderNpcList() {
        const section = document.getElementById('npc-section');
        const container = document.getElementById('npc-list');
        const actionsContainer = document.getElementById('npc-actions');
        if (!section || !container || !actionsContainer) return;
        const grid = (Engine.cur && Engine.cur.grid) || [];
        const npcIds = [];
        grid.forEach(c => {
            if (c && c.npc_id && !npcIds.includes(c.npc_id)) npcIds.push(c.npc_id);
        });
        if (npcIds.length === 0) {
            section.style.display = 'none';
            container.innerHTML = '';
            actionsContainer.innerHTML = '';
            return;
        }
        section.style.display = '';
        container.innerHTML = '';
        actionsContainer.innerHTML = '<p class="menu-hint">选择一位角色以查看其信息与可做的事。</p>';
        npcIds.forEach(id => {
            const def = Engine.db.npcs[id];
            if (!def) return;
            const btn = document.createElement('button');
            btn.className = 'npc-list-btn';
            btn.innerText = def.sn || id;
            btn.onclick = () => {
                const acts = def.action_ids || [];
                const fullName = def.sn || '人物';
                UI.renderMenu('npc-actions', acts, fullName);
            };
            container.appendChild(btn);
        });
    },

    getItemDescription(itemId, state) {
        const baseId = (typeof InventoryUtils !== 'undefined' && InventoryUtils.getBaseItemId) ? InventoryUtils.getBaseItemId(itemId) : itemId;
        const obj = (Engine.db.objects && Engine.db.objects[baseId]) || (Engine.db.items && Engine.db.items[baseId]);
        if (obj && obj.tags && obj.tags.includes('seed')) {
            const flv = (state && state.production_skills && state.production_skills.farming && state.production_skills.farming.level) || 0;
            if (flv < 1) return "一些不起眼的小颗粒，看不出是什么。";
        }
        let meta = UI.getOreMeta(baseId) || UI.getForageMeta(baseId);
        if (!meta) return (obj && obj.fn) ? obj.fn : '';
        const miningLv = (state && state.production_skills && state.production_skills.mining && state.production_skills.mining.level) || 0;
        const loggingLv = (state && state.production_skills && state.production_skills.logging && state.production_skills.logging.level) || 0;
        const gatheringLv = (state && state.survival_skills && state.survival_skills.gathering && state.survival_skills.gathering.level) || 0;
        const fishingLv = (state && state.survival_skills && state.survival_skills.fishing && state.survival_skills.fishing.level) || 0;
        const farmingLv = (state && state.production_skills && state.production_skills.farming && state.production_skills.farming.level) || 0;
        const huntingLv = (state && state.survival_skills && state.survival_skills.hunting && state.survival_skills.hunting.level) || 0;
        const basicAt = meta.reveal_basic_at || 999;
        const advAt = meta.reveal_advanced_at || 999;
        const tags = meta.tags || [];
        let lv = miningLv;
        if (tags.includes('forage')) lv = gatheringLv;
        else if (tags.includes('wood')) lv = loggingLv;
        else if (tags.includes('fish')) lv = fishingLv;
        else if (tags.includes('crop')) lv = farmingLv;
        else if (tags.includes('game')) lv = huntingLv;
        if (lv >= advAt && meta.fn_advanced) return meta.fn_advanced;
        if (lv >= basicAt && meta.fn_basic) return meta.fn_basic;
        return meta.fn_unknown || (obj && obj.fn) || '';
    },

    showItemTooltip(itemId, anchorEl) {
        const tooltip = document.getElementById('item-tooltip');
        if (!tooltip || !anchorEl) return;
        const baseId = Engine.getBaseItemId ? Engine.getBaseItemId(itemId) : itemId;
        const name = UI.getItemDisplayName(baseId, Engine.state);
        const desc = UI.getItemDescription(baseId, Engine.state);
        tooltip.innerHTML = `<div class="item-tooltip-name">${name}</div>${desc ? `<div class="item-tooltip-desc">${desc}</div>` : ''}`;
        const rect = anchorEl.getBoundingClientRect();
        let x = rect.right + 8;
        let y = rect.top;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        tooltip.classList.remove('hidden');
        tooltip.style.visibility = 'hidden';
        tooltip.style.left = '0px';
        tooltip.style.top = '0px';
        const tw = tooltip.offsetWidth;
        const th = tooltip.offsetHeight;
        if (x + tw + 16 > vw) x = rect.left - tw - 8;
        if (x < 8) x = 8;
        if (y + th + 16 > vh) y = vh - th - 16;
        if (y < 8) y = 8;
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
        tooltip.style.visibility = 'visible';
    },

    hideItemTooltip() {
        const tooltip = document.getElementById('item-tooltip');
        if (!tooltip) return;
        tooltip.classList.add('hidden');
    },

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
        const skillContainer = document.getElementById('skill-categories-container');
        const skillSection = document.getElementById('skill-section');
        const stateSection = document.getElementById('state-section');
        if (stateSection) stateSection.style.display = 'none';

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
        const combatActiveContainer = document.getElementById('combat-active-container');
        const hasCombat = Engine.hasCombatAwareness(state);
        if (combatSection) combatSection.style.display = hasCombat ? '' : 'none';
        if (combatContainer && hasCombat) {
            UI.renderCombatSlots(combatContainer, state);
        }
        if (combatActiveContainer) {
            combatActiveContainer.style.display = 'none';
        }
    },

    survivalSkillName(id) { const n = { breathing: '呼吸' }; return n[id] || id; },
    productionSkillName(id) {
        const n = { mining: '挖矿', logging: '伐木', farming: '种植', cooking: '烹饪', medicine: '制药', leatherworking: '制皮', smithing: '锻造', carpentry: '木工', tailoring: '缝纫', enchanting: '附魔' };
        return n[id] || (Engine.db.crafting_skills && Engine.db.crafting_skills[id] && Engine.db.crafting_skills[id].sn) || id;
    },
    supportSkillName(id) { const n = { probe: '探查', almanac: '看黄历', common_tongue: '通用语' }; return n[id] || id; },
    skillName(skillId) {
        const names = {
            basic_sword: '基本剑法', basic_blade: '基本刀法', basic_throwing: '基本暗器', basic_spear: '基本枪法',
            basic_palm: '基本掌法', basic_fist: '基本拳法', basic_leg: '基本腿法', basic_staff: '基本棍法',
            basic_finger: '基本指法', basic_movement: '基本身法', basic_internal: '基本内功', basic_parry: '基本招架'
        };
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
        const unlockedSlots = new Set();
        Object.entries(UI.COMBAT_SKILL_SLOT || {}).forEach(([skillId, slotName]) => {
            if (!progress[skillId]) return;
            unlockedSlots.add(slotName);
        });
        container.innerHTML = '';
        slotOrder.forEach(slotName => {
            if (!unlockedSlots.has(slotName)) return;
            const skillId = slots[slotName];
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'combat-slot-btn' + (skillId ? '' : ' combat-slot-empty');
            btn.setAttribute('data-slot', slotName);
            if (skillId) {
                const prog = progress[skillId];
                const level = prog && prog.level != null ? prog.level : 1;
                const levelMax = prog && prog.level_max != null ? prog.level_max : 1000;
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

    updateCombatPanel() {
        const state = Engine.state;
        const enemies = (state.combat_enemies || []).filter(e => !CombatActions.isTargetDead(e.state));
        const queued = state.combat_queued_command;

        const actionsRowEl = document.getElementById('combat-cmd-row');
        if (actionsRowEl && state.in_combat) {
            actionsRowEl.innerHTML = '';
            const btnItem = document.createElement('button');
            btnItem.type = 'button';
            btnItem.className = 'action-brick';
            btnItem.textContent = queued && queued.type === 'item' ? '道具 (已选)' : '道具';
            btnItem.onclick = () => {
                const inv = state.inventory || {};
                const objects = Engine.db.objects || {};
                const options = [];
                Object.keys(inv).forEach(itemId => {
                    const baseId = (typeof InventoryUtils !== 'undefined' && InventoryUtils.getBaseItemId) ? InventoryUtils.getBaseItemId(itemId) : itemId;
                    const obj = objects[baseId];
                    if (obj && (obj.effect_id === 'heal_limb' || obj.effect === 'heal_limb')) {
                        const name = UI.getItemDisplayName ? UI.getItemDisplayName(itemId, state) : (obj.sn || itemId);
                        const heal = (obj.effect_params && obj.effect_params.heal) || (obj.heal_amount) || 20;
                        options.push({ key: itemId, text: name + ' (+' + heal + ')', heal_amount: heal });
                    }
                });
                if (options.length === 0) {
                    Engine.log('背包内无可用的治疗道具。');
                    return;
                }
                UI.showChoiceModal('使用道具', options, (key) => {
                    const opt = options.find(o => o.key === key);
                    CombatEngine.queueCommand({ type: 'item', item_id: key, effect: 'heal_limb', heal_amount: opt && opt.heal_amount ? opt.heal_amount : 20 });
                    if (typeof UI !== 'undefined' && UI.updateCombatPanel) UI.updateCombatPanel();
                });
            };
            actionsRowEl.appendChild(btnItem);
            const btnFlee = document.createElement('button');
            btnFlee.type = 'button';
            btnFlee.className = 'action-brick';
            btnFlee.textContent = queued && queued.type === 'flee' ? '逃跑 (已选)' : '逃跑';
            btnFlee.onclick = () => {
                CombatEngine.queueCommand({ type: 'flee' });
                if (typeof UI !== 'undefined' && UI.updateCombatPanel) UI.updateCombatPanel();
            };
            actionsRowEl.appendChild(btnFlee);
        }

        const enemyListEl = document.getElementById('combat-enemy-list');
        if (enemyListEl && !state.in_combat) {
            enemyListEl.innerHTML = '<p class="menu-hint">无</p>';
        }
    },

    showCombatModal() {
        const modal = document.getElementById('combat-modal');
        const logEl = document.getElementById('combat-log-content');
        if (!modal || !logEl) return;
        logEl.innerHTML = '';
        modal.classList.remove('hidden');
        UI.updateCombatPanel();
    },

    closeCombatModal() {
        const modal = document.getElementById('combat-modal');
        if (modal) modal.classList.add('hidden');
    },

    appendCombatLog(html) {
        const wrap = document.getElementById('combat-log-content');
        if (!wrap) return;
        const el = document.createElement('div');
        el.className = 'log';
        el.innerHTML = html;
        wrap.appendChild(el);
        wrap.scrollTop = wrap.scrollHeight;
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
                const levelMax = prog && prog.level_max != null ? prog.level_max : 1000;
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
            const baseId = Engine.getBaseItemId ? Engine.getBaseItemId(itemId) : itemId;
            const item = (Engine.db.objects && Engine.db.objects[baseId]) || (Engine.db.items && Engine.db.items[baseId]);
            if (!item) return;
            const btn = document.createElement('button');
            btn.className = 'action-brick';
            const name = UI.getItemDisplayName(baseId, Engine.state);
            btn.innerHTML = count > 1 ? `${name} x${count}<br><span style="font-size:10px;">捡起</span>` : `${name}<br><span style="font-size:10px;">捡起</span>`;
            btn.onclick = () => {
                Engine.run([{ type: 'take_item_from_ground', item_id: itemId }]);
                Engine.render();
            };
            btn.onmouseenter = () => UI.showItemTooltip(baseId, btn);
            btn.onmouseleave = () => UI.hideItemTooltip();
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

            const wrap = document.createElement('div');
            wrap.className = 'inventory-row';
            wrap.style.display = 'flex';
            wrap.style.alignItems = 'stretch';
            wrap.style.gap = '4px';
            wrap.style.marginBottom = '4px';

            const btn = document.createElement('button');
            btn.className = "action-brick";
            btn.style.flex = '1';
            const name = UI.getItemDisplayName(baseId, state);
            const locked = (state.inventory_locked || {})[itemId];
            let countBadge = count > 1 ? `<span style="font-size:10px;color:#888;position:absolute;right:4px;bottom:2px;">x${count}</span>` : '';
            if (locked) countBadge = '<span style="position:absolute;top:2px;right:4px;font-size:10px;" title="已锁定">🔒</span>' + countBadge;
            btn.innerHTML = `${name}${countBadge}`;
            btn.style.position = 'relative';
            btn.onclick = () => Engine.showItemActions(itemId);
            btn.onmouseenter = () => UI.showItemTooltip(baseId, btn);
            btn.onmouseleave = () => UI.hideItemTooltip();

            const lockBtn = document.createElement('button');
            lockBtn.type = 'button';
            lockBtn.className = 'item-lock-btn';
            lockBtn.title = locked ? '点击解锁' : '点击锁定（锁定后不可作为生产原料）';
            lockBtn.textContent = locked ? '🔒' : '◇';
            lockBtn.onclick = (e) => {
                e.stopPropagation();
                if (!Engine.state.inventory_locked) Engine.state.inventory_locked = {};
                if (Engine.state.inventory_locked[itemId]) {
                    delete Engine.state.inventory_locked[itemId];
                } else {
                    Engine.state.inventory_locked[itemId] = true;
                }
                UI.renderInventory(Engine.state);
            };
            wrap.appendChild(btn);
            wrap.appendChild(lockBtn);
            container.appendChild(wrap);
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

    showManualMiningModal(ctx) {
        const prog = Engine.getSkillProgress && Engine.getSkillProgress('production', 'mining');
        const lv = (prog && prog.level) ? prog.level : 1;
        const skillBonus = Math.min(2, Math.floor(lv / 25));
        const steps = [
            [
                { id: 'crack', text: '顺着裂缝下锤', score: 2, log: '你顺着已有的裂缝下锤，石屑四溅。' },
                { id: 'flat', text: '随便找块平面敲一敲', score: 0, log: '你在岩壁上选了块看似顺眼的地方敲了几下。' }
            ],
            [
                { id: 'follow', text: '沿着刚才的痕迹再敲', score: 2, log: '你沿着之前的痕迹继续用力，裂纹隐约向里延伸。' },
                { id: 'change', text: '换个地方试试', score: -1, log: '你换了个地方试敲，手感有些发闷。' }
            ],
            [
                { id: 'steady', text: '稳稳再来一锤', score: 2, log: '你调整呼吸，再次稳稳落锤，岩壁发出清脆的回响。' },
                { id: 'rush', text: '趁势猛砸几下', score: -1, log: '你有些心急，连砸几下，只敲下一堆碎渣。' }
            ]
        ];
        let step = 0;
        let totalScore = 0;
        const runStep = () => {
            if (step >= steps.length) {
                const baseDiff = ctx.difficulty || 2;
                let diffAdj = baseDiff;
                if (totalScore >= 4) diffAdj = Math.max(1, baseDiff - 1);
                else if (totalScore <= -1) diffAdj = baseDiff + 1;
                const turnCost = ctx.turnCost || 3;
                Engine.advanceTime(turnCost * 10);
                const cmd = { type: 'mine_ore', mode: 'manual', difficulty: diffAdj, cycles: 1 };
                if (ctx.ore_vein && Object.keys(ctx.ore_vein).length > 0) cmd.ore_vein = ctx.ore_vein; else cmd.ore_item_id = ctx.ore_item_id || 'iron_ore';
                Engine.run([cmd, { type: 'mod_stat', key: 'fatigue', val: 2 }]);
                Engine.render();
                return;
            }
            const opts = steps[step];
            const options = opts.map(o => ({ key: o.id, text: o.text }));
            const title = '手动挖矿';
            const subtitle = step === 0 ? '仔细选择下锤的位置与方式。' : '继续顺着刚才的手感调整力度与角度。';
            const subtitleEl = document.getElementById('choice-modal-subtitle');
            if (subtitleEl) {
                subtitleEl.textContent = subtitle;
                subtitleEl.style.display = '';
            }
            UI.showChoiceModal(title, options, (key) => {
                const chosen = opts.find(o => o.id === key);
                if (chosen) {
                    totalScore += chosen.score + (chosen.score > 0 ? skillBonus : 0);
                    if (chosen.log) Engine.log(chosen.log);
                }
                step += 1;
                runStep();
            }, 'manual');
        };
        runStep();
    },

    showManualLoggingModal(ctx) {
        const prog = Engine.getSkillProgress && Engine.getSkillProgress('production', 'logging');
        const lv = (prog && prog.level) ? prog.level : 1;
        const skillBonus = Math.min(2, Math.floor(lv / 25));
        const steps = [
            [
                { id: 'root', text: '靠近树根下斧', score: 2, log: '你把斧口尽量贴近树根，争取让受力更稳定。' },
                { id: 'waist', text: '从腰部偏上砍下去', score: 0, log: '你选在腰部附近试砍，虽不算理想，好歹能下刀。' }
            ],
            [
                { id: 'steady', text: '每斧都找准角度', score: 2, log: '你刻意调整角度，让每一斧都顺着木纹落下。' },
                { id: 'rush', text: '图省事猛砍几下', score: -1, log: '你图快连砍几下，斧口有几次明显打滑。' }
            ],
            [
                { id: 'rhythm', text: '按节奏抬斧落斧', score: 2, log: '你跟着自己的呼吸节奏挥斧，动作渐渐变得顺手。' },
                { id: 'random', text: '想到哪儿砍哪儿', score: -1, log: '你一会儿砍这里一会儿砍那里，树干上坑坑洼洼。' }
            ]
        ];
        let step = 0;
        let totalScore = 0;
        const runStep = () => {
            if (step >= steps.length) {
                const baseDiff = ctx.difficulty || 2;
                let diffAdj = baseDiff;
                if (totalScore >= 4) diffAdj = Math.max(1, baseDiff - 1);
                else if (totalScore <= -1) diffAdj = baseDiff + 1;
                const turnCost = ctx.turnCost || 3;
                Engine.advanceTime(turnCost * 10);
                Engine.run([
                    { type: 'chop_wood', mode: 'manual', difficulty: diffAdj, wood_item_id: ctx.woodItemId || 'pine_log', cycles: 1 },
                    { type: 'mod_stat', key: 'fatigue', val: 3 }
                ]);
                Engine.render();
                return;
            }
            const opts = steps[step];
            const options = opts.map(o => ({ key: o.id, text: o.text }));
            const title = '手动伐木';
            const subtitle = step === 0 ? '先决定从哪里下斧。' : '继续根据反馈调整力道与节奏。';
            const subtitleEl = document.getElementById('choice-modal-subtitle');
            if (subtitleEl) {
                subtitleEl.textContent = subtitle;
                subtitleEl.style.display = '';
            }
            UI.showChoiceModal(title, options, (key) => {
                const chosen = opts.find(o => o.id === key);
                if (chosen) {
                    totalScore += chosen.score + (chosen.score > 0 ? skillBonus : 0);
                    if (chosen.log) Engine.log(chosen.log);
                }
                step += 1;
                runStep();
            }, 'manual');
        };
        runStep();
    },

    showManualHuntingModal(ctx) {
        const prog = Engine.getSkillProgress && Engine.getSkillProgress('survival', 'hunting');
        const lv = (prog && prog.level) ? prog.level : 1;
        const skillBonus = Math.min(2, Math.floor(lv / 25));
        const steps = [
            [
                { id: 'track', text: '顺着足迹与粪便辨踪', score: 2, log: '你蹲下身辨认地上的痕迹，大致摸清了猎物的去向。' },
                { id: 'wander', text: '随便走走碰运气', score: 0, log: '你在林子里转了一圈，没发现什么明显的踪迹。' }
            ],
            [
                { id: 'stalk', text: '压低身子悄悄接近', score: 2, log: '你放轻脚步，借着灌木一点点靠近。' },
                { id: 'rush', text: '看准方向直接冲过去', score: -1, log: '你猛地一冲，惊得草动树摇，猎物早跑了。' }
            ],
            [
                { id: 'steady', text: '稳住呼吸再出手', score: 2, log: '你屏住气，等它放松警惕的瞬间下手。' },
                { id: 'early', text: '忍不住抢先动手', score: -1, log: '你出手太早，猎物一惊，蹿得没影。' }
            ]
        ];
        let step = 0;
        let totalScore = 0;
        const runStep = () => {
            if (step >= steps.length) {
                const baseDiff = ctx.difficulty || 2;
                let diffAdj = baseDiff;
                if (totalScore >= 4) diffAdj = Math.max(1, baseDiff - 1);
                else if (totalScore <= -1) diffAdj = baseDiff + 1;
                const turnCost = ctx.turnCost || 4;
                Engine.advanceTime(turnCost * 10);
                Engine.run([
                    { type: 'hunt_game', mode: 'manual', difficulty: diffAdj, cycles: 1 },
                    { type: 'mod_stat', key: 'fatigue', val: 2 }
                ]);
                Engine.render();
                return;
            }
            const opts = steps[step];
            const options = opts.map(o => ({ key: o.id, text: o.text }));
            const title = '手动狩猎';
            const subtitle = step === 0 ? '先辨明猎物的踪迹。' : step === 1 ? '选择接近的方式。' : '把握下手的时机。';
            const subtitleEl = document.getElementById('choice-modal-subtitle');
            if (subtitleEl) {
                subtitleEl.textContent = subtitle;
                subtitleEl.style.display = '';
            }
            UI.showChoiceModal(title, options, (key) => {
                const chosen = opts.find(o => o.id === key);
                if (chosen) {
                    totalScore += chosen.score + (chosen.score > 0 ? skillBonus : 0);
                    if (chosen.log) Engine.log(chosen.log);
                }
                step += 1;
                runStep();
            }, 'manual');
        };
        runStep();
    },

    showManualFishingModal(ctx) {
        const modal = document.getElementById('choice-modal');
        const titleEl = document.getElementById('choice-modal-title');
        const subtitleEl = document.getElementById('choice-modal-subtitle');
        const optionsContainer = document.getElementById('choice-options');
        const cancelBtn = document.getElementById('choice-cancel-btn');
        if (!modal || !titleEl || !optionsContainer) return;

        titleEl.innerText = '手动钓鱼';
        if (subtitleEl) {
            subtitleEl.textContent = '注意浮漂，鱼咬钩时及时提竿！';
            subtitleEl.style.display = '';
        }
        optionsContainer.innerHTML = '';
        optionsContainer.className = 'action-brick-container choice-options choice-options--manual';

        let biteTime = 0;
        let biteTimer = null;
        let windowTimer = null;
        const perfectWindowMs = 800;
        const biteDelayMs = 2000 + Math.random() * 3000;

        const finish = (manual_result) => {
            if (biteTimer) clearTimeout(biteTimer);
            if (windowTimer) clearTimeout(windowTimer);
            if (subtitleEl) subtitleEl.classList.remove('fishing-bite');
            modal.classList.add('hidden');
            modal.classList.remove('choice-modal--manual');
            const turnCost = ctx.turnCost || 3;
            Engine.advanceTime(turnCost * 10);
            Engine.run([
                { type: 'catch_fish', mode: 'manual', difficulty: ctx.difficulty || 2, fish_item_id: ctx.fishItemId || 'dull_bass', cycles: 1, manual_result },
                { type: 'mod_stat', key: 'fatigue', val: 1 }
            ]);
            Engine.render();
        };

        const liftBtn = document.createElement('button');
        liftBtn.className = 'choice-option-btn';
        liftBtn.innerText = '提竿';
        liftBtn.onclick = () => {
            if (biteTimer) clearTimeout(biteTimer);
            if (windowTimer) clearTimeout(windowTimer);
            const now = Date.now();
            let manual_result = 'miss';
            if (biteTime > 0) {
                if (now - biteTime <= perfectWindowMs) {
                    manual_result = 'perfect';
                    if (subtitleEl) subtitleEl.textContent = '正好！鱼被稳稳提了上来。';
                } else {
                    manual_result = 'late';
                    if (subtitleEl) subtitleEl.textContent = '慢了，鱼已脱钩。';
                }
            } else {
                manual_result = 'early';
                if (subtitleEl) subtitleEl.textContent = '太早了，鱼还没咬钩。';
            }
            finish(manual_result);
        };
        optionsContainer.appendChild(liftBtn);

        biteTimer = setTimeout(() => {
            biteTime = Date.now();
            biteTimer = null;
            if (subtitleEl) {
                subtitleEl.textContent = '咬钩了！快提竿！';
                subtitleEl.classList.add('fishing-bite');
            }
            windowTimer = setTimeout(() => {}, perfectWindowMs);
        }, biteDelayMs);

        const cancelListener = () => {
            if (biteTimer) clearTimeout(biteTimer);
            if (windowTimer) clearTimeout(windowTimer);
            if (subtitleEl) subtitleEl.classList.remove('fishing-bite');
            modal.classList.add('hidden');
            modal.classList.remove('choice-modal--manual');
            Engine.log("你收竿作罢。");
        };
        cancelBtn.onclick = cancelListener;
        modal.classList.add('choice-modal--manual');
        modal.classList.remove('hidden');
    },

    showChoiceModal(title, options, callback, layout) {
        const modal = document.getElementById('choice-modal');
        const titleEl = document.getElementById('choice-modal-title');
        const optionsContainer = document.getElementById('choice-options');
        const cancelBtn = document.getElementById('choice-cancel-btn');

        titleEl.innerText = title;
        const subtitleEl = document.getElementById('choice-modal-subtitle');
        if (subtitleEl && layout === 'combat-skill') {
            subtitleEl.textContent = '选择要装备至此槽位的技能';
            subtitleEl.style.display = '';
        } else if (subtitleEl && layout !== 'manual') {
            // 对于手动挖矿等调用者会自己设置 subtitle，这里不干预
            subtitleEl.textContent = '';
            subtitleEl.style.display = 'none';
        }
        optionsContainer.innerHTML = '';
        let extraClass = '';
        if (layout === 'combat-skill') extraClass = ' choice-options--list';
        else if (layout === 'manual') extraClass = ' choice-options--manual';
        else if (layout === 'list') extraClass = ' choice-options--list';
        optionsContainer.className = 'action-brick-container choice-options' + extraClass;
        modal.classList.remove('choice-modal--combat', 'choice-modal--manual', 'choice-modal--list');
        if (layout === 'combat-skill') modal.classList.add('choice-modal--combat');
        else if (layout === 'manual') modal.classList.add('choice-modal--manual');
        else if (layout === 'list') modal.classList.add('choice-modal--list');

        const cleanup = () => {
            modal.classList.add('hidden');
            modal.classList.remove('choice-modal--combat', 'choice-modal--manual', 'choice-modal--list');
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

        const isList = layout === 'combat-skill' || layout === 'manual' || layout === 'list';
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

    showBuildModal() {
        const modal = document.getElementById('build-modal');
        const optionsContainer = document.getElementById('build-options');
        const cancelBtn = document.getElementById('build-cancel-btn');
        if (!modal || !optionsContainer || !cancelBtn) return;

        const buildings = Engine.db.buildings || {};
        const unlocked = Engine.state.unlocked_buildings || {};
        const list = Object.entries(buildings).filter(([id, def]) => unlocked[id] && (def.materials && Object.keys(def.materials).length > 0));
        if (list.length === 0) {
            Engine.log("你还没有解锁任何建筑蓝图。");
            return;
        }

        optionsContainer.innerHTML = '';
        list.forEach(([buildingId, def]) => {
            const materials = def.materials || {};
            let canBuild = true;
            for (const [matId, need] of Object.entries(materials)) {
                const have = typeof Engine.countAvailableMaterial === 'function' ? Engine.countAvailableMaterial(matId) : 0;
                if (have < need) { canBuild = false; break; }
            }
            const matText = Object.entries(materials).map(([mid, n]) => {
                const name = (Engine.db.objects && Engine.db.objects[mid] && Engine.db.objects[mid].sn) || mid;
                return name + '×' + n;
            }).join('、');
            const btn = document.createElement('button');
            btn.className = 'choice-option-btn' + (canBuild ? '' : ' disabled');
            btn.innerText = (def.sn || buildingId) + (matText ? '（' + matText + '）' : '');
            if (canBuild) {
                btn.onclick = () => {
                    modal.classList.add('hidden');
                    Engine.run([{ type: 'build_building', building_id: buildingId }]);
                    Engine.render();
                };
            } else {
                btn.disabled = true;
            }
            optionsContainer.appendChild(btn);
        });

        cancelBtn.onclick = () => {
            modal.classList.add('hidden');
            Engine.log("你取消了建造。");
        };
        modal.classList.remove('hidden');
    },

    showStorageModal(containerObject) {
        const modal = document.getElementById('storage-modal');
        const closeBtn = document.getElementById('storage-close-btn');
        const containerContent = document.getElementById('storage-container-content');
        const playerContent = document.getElementById('storage-player-content');
        if(!modal || !closeBtn || !containerContent || !playerContent) return;

        const getBaseItemId = (key) => (key && /_\d+$/.test(key)) ? key.replace(/_\d+$/, '') : key;
        const containerId = containerObject.id || ('grid_' + (Engine.cur && Engine.pIdx != null ? Engine.pIdx : 0));
        if (!Engine.state.container_locked) Engine.state.container_locked = {};
        if (!Engine.state.container_locked[containerId]) Engine.state.container_locked[containerId] = {};

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
                li.style.display = 'flex';
                li.style.alignItems = 'stretch';
                li.style.gap = '4px';

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'storage-list-btn';
                btn.style.flex = '1';
                const name = UI.getItemDisplayName(baseId, Engine.state);
                btn.textContent = count > 1 ? `${name} ×${count}` : name;
                btn.onclick = () => {
                    const cmd = { item_id: key, count: 1, container_id: containerObject.id };
                    if (type === 'player') cmd.type = 'move_item_to_container';
                    else cmd.type = 'move_item_from_container';
                    Engine.run([cmd]);
                    refresh();
                };
                btn.onmouseenter = () => UI.showItemTooltip(baseId, btn);
                btn.onmouseleave = () => UI.hideItemTooltip();

                const lockBtn = document.createElement('button');
                lockBtn.type = 'button';
                lockBtn.className = 'item-lock-btn';
                const locked = type === 'player'
                    ? (Engine.state.inventory_locked || {})[key]
                    : (Engine.state.container_locked[containerId] || {})[key];
                lockBtn.title = locked ? '点击解锁' : '点击锁定（不可作为生产原料）';
                lockBtn.textContent = locked ? '🔒' : '◇';
                lockBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (type === 'player') {
                        if (!Engine.state.inventory_locked) Engine.state.inventory_locked = {};
                        if (Engine.state.inventory_locked[key]) delete Engine.state.inventory_locked[key];
                        else Engine.state.inventory_locked[key] = true;
                    } else {
                        if (!Engine.state.container_locked[containerId]) Engine.state.container_locked[containerId] = {};
                        if (Engine.state.container_locked[containerId][key]) delete Engine.state.container_locked[containerId][key];
                        else Engine.state.container_locked[containerId][key] = true;
                    }
                    refresh();
                };

                li.appendChild(btn);
                li.appendChild(lockBtn);
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

    updateDayNightCanvas(time) {
        const canvas = document.getElementById('status-bar-canvas');
        const bar = document.getElementById('status-bar');
        if (!canvas || !bar || !time) return;
        const w = bar.offsetWidth;
        const h = bar.offsetHeight;
        if (w <= 0 || h <= 0) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(dpr, dpr);
        const hourF = (time.hour || 0) + (time.minute != null ? time.minute / 60 : 0);
        // 中午(12时)最亮、半夜(0/24时)最暗；黎明/傍晚平滑过渡
        const alpha = 0.5 * 0.5 * (1 - Math.cos(((hourF - 12) * Math.PI) / 12));
        ctx.fillStyle = `rgba(0,0,0,${Math.max(0, Math.min(1, alpha))})`;
        ctx.fillRect(0, 0, w, h);
    },

    updateStatus(time, sceneName) {
        const tEl = document.getElementById('time-display');
        const lEl = document.getElementById('loc-display');
        if (typeof time === 'object' && time !== null) UI.updateDayNightCanvas(time);
        if (tEl) {
            const dayIndex = (Engine.state && Engine.state.day_index) || 1;
            let timePart = '';
            if (Engine.state && Engine.state.has_time_building) {
                const hh = time.hour.toString().padStart(2, '0');
                const mm = time.minute.toString().padStart(2, '0');
                timePart = `${hh}:${mm}`;
            } else {
                const h = time.hour;
                let period = '';
                if (h >= 0 && h < 6) period = '凌晨';
                else if (h < 12) period = '早上';
                else if (h < 14) period = '中午';
                else if (h < 18) period = '下午';
                else period = '晚上';
                timePart = period;
            }
            let text = `第${dayIndex}天 ${timePart}`;
            const hasAlmanacSkill = Engine.getSkillProgress && Engine.getSkillProgress('support', 'almanac');
            const almanac = Engine.state && Engine.state.todayAlmanac;
            if (hasAlmanacSkill && almanac && almanac.text) {
                text += `｜${almanac.text}`;
            }
            tEl.innerText = text;
        }
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

    // Modal resize: all .modal-content can be stretched by dragging the bottom-right handle
    const initModalResizers = () => {
        const overlays = document.querySelectorAll('.modal-overlay');
        overlays.forEach(overlay => {
            const content = overlay.querySelector('.modal-content');
            if (!content || content.querySelector('.modal-resize-handle')) return;
            const handle = document.createElement('div');
            handle.className = 'modal-resize-handle';
            handle.setAttribute('title', '拖拽调整大小');
            content.appendChild(handle);
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const startX = e.clientX;
                const startY = e.clientY;
                const startW = content.offsetWidth;
                const startH = content.offsetHeight;
                const minW = 280;
                const minH = 120;
                const maxW = Math.max(600, window.innerWidth - 40);
                const maxH = Math.max(400, window.innerHeight - 40);
                const doDrag = (e) => {
                    const dw = e.clientX - startX;
                    const dh = e.clientY - startY;
                    let w = Math.min(maxW, Math.max(minW, startW + dw));
                    let h = Math.min(maxH, Math.max(minH, startH + dh));
                    content.style.width = w + 'px';
                    content.style.height = h + 'px';
                    content.style.maxWidth = w + 'px';
                };
                const stopDrag = () => {
                    window.removeEventListener('mousemove', doDrag, false);
                    window.removeEventListener('mouseup', stopDrag, false);
                };
                window.addEventListener('mousemove', doDrag, false);
                window.addEventListener('mouseup', stopDrag, false);
            });
        });
    };
    initModalResizers();

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
