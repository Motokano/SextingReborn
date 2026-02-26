// csv-sync.js — data/*.json <-> CSV，方便表格编辑
const fs = require('fs');
const path = require('path');

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function writeJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
  console.log('Wrote JSON:', p);
}

function toCSV(rows) {
  return rows.map(row =>
    row.map(v => {
      if (v === null || v === undefined) v = '';
      v = String(v);
      if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
      return v;
    }).join(',')
  ).join('\n');
}

function writeCSVWithBom(p, rows) {
  ensureDir(p);
  const content = '\uFEFF' + toCSV(rows);
  fs.writeFileSync(p, content, 'utf8');
}

function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\r') {}
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  return rows;
}

function boolFrom(v) {
  if (!v) return false;
  v = String(v).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
function numFrom(v) {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}
function splitList(v) {
  if (!v) return [];
  return String(v).split(';').map(s => s.trim()).filter(Boolean);
}
function ensureDir(p) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function exportConfig() {
  const cfg = readJSON(path.join(__dirname, 'data', 'config.json'));
  const p = path.join(__dirname, 'data', 'config.csv');
  writeCSVWithBom(p, [
    ['startScene', 'startIndex', 'sys_actions'],
    [cfg.startScene || '', cfg.startIndex != null ? cfg.startIndex : '', (cfg.sys_actions || []).join(';')]
  ]);
  console.log('Exported config');
}
function importConfig() {
  const p = path.join(__dirname, 'data', 'config.csv');
  if (!fs.existsSync(p)) return;
  const rows = parseCSV(fs.readFileSync(p, 'utf8'));
  if (rows.length < 2) return;
  const h = rows[0], r = rows[1], idx = n => h.indexOf(n), get = n => (idx(n) >= 0 ? r[idx(n)] || '' : '');
  const cfg = {};
  if (get('startScene')) cfg.startScene = get('startScene');
  const si = numFrom(get('startIndex'));
  if (si != null) cfg.startIndex = si;
  const acts = splitList(get('sys_actions'));
  if (acts.length) cfg.sys_actions = acts;
  writeJSON(path.join(__dirname, 'data', 'config.json'), cfg);
}

function exportNpcs() {
  const data = readJSON(path.join(__dirname, 'data', 'npcs.json'));
  const rows = [['id', 'sn', 'fn', 'race', 'type', 'is_player', 'tags', 'action_ids']];
  Object.entries(data).forEach(([id, npc]) => {
    rows.push([id, npc.sn || '', npc.fn || '', npc.race || '', npc.type || '', npc.is_player ? '1' : '', (npc.tags || []).join(';'), (npc.action_ids || []).join(';')]);
  });
  const p = path.join(__dirname, 'data', 'npcs.csv');
  writeCSVWithBom(p, rows);
  console.log('Exported npcs');
}
function importNpcs() {
  const jsonPath = path.join(__dirname, 'data', 'npcs.json');
  const csvPath = path.join(__dirname, 'data', 'npcs.csv');
  if (!fs.existsSync(csvPath)) return;
  const original = fs.existsSync(jsonPath) ? readJSON(jsonPath) : {};
  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));
  if (!rows.length) return;
  const h = rows[0], idx = n => h.indexOf(n);
  const out = { ...original };
  rows.slice(1).forEach(row => {
    const id = (row[idx('id')] || '').trim();
    if (!id) return;
    const get = c => (idx(c) >= 0 ? row[idx(c)] || '' : '');
    const npc = { ...(original[id] || {}) };
    npc.sn = get('sn') || undefined;
    if (get('fn')) npc.fn = get('fn');
    if (get('race')) npc.race = get('race');
    if (get('type')) npc.type = get('type');
    npc.is_player = boolFrom(get('is_player')) || undefined;
    const tags = splitList(get('tags'));
    npc.tags = tags.length ? tags : undefined;
    const acts = splitList(get('action_ids'));
    npc.action_ids = acts.length ? acts : undefined;
    out[id] = npc;
  });
  writeJSON(jsonPath, out);
}

function exportObjects() {
  const data = readJSON(path.join(__dirname, 'data', 'objects.json'));
  const rows = [[
    'id',
    'sn',
    'fn',
    'type',
    'weight',
    'tags',
    'action_ids',
    'blocking',
    'stack_limit',
    'capacity',
    'use_target',
    'use_scope',
    'use_limb_filter',
    'effect_id',
    'effect_params_json'
  ]];
  Object.entries(data).forEach(([id, obj]) => {
    rows.push([
      id,
      obj.sn || '',
      obj.fn || '',
      obj.type || '',
      obj.weight != null ? obj.weight : '',
      (obj.tags || []).join(';'),
      (obj.action_ids || []).join(';'),
      obj.blocking ? '1' : '',
      obj.stack_limit != null ? obj.stack_limit : '',
      obj.capacity != null ? obj.capacity : '',
      obj.use_target || '',
      obj.use_scope || '',
      obj.use_limb_filter || '',
      obj.effect_id || '',
      obj.effect_params ? JSON.stringify(obj.effect_params) : ''
    ]);
  });
  const p = path.join(__dirname, 'data', 'objects.csv');
  writeCSVWithBom(p, rows);
  console.log('Exported objects');
}
function importObjects() {
  const jsonPath = path.join(__dirname, 'data', 'objects.json');
  const csvPath = path.join(__dirname, 'data', 'objects.csv');
  if (!fs.existsSync(csvPath)) return;
  const original = fs.existsSync(jsonPath) ? readJSON(jsonPath) : {};
  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));
  if (!rows.length) return;
  const h = rows[0], idx = n => h.indexOf(n);
  const out = { ...original };
  rows.slice(1).forEach(row => {
    const id = (row[idx('id')] || '').trim();
    if (!id) return;
    const get = c => (idx(c) >= 0 ? row[idx(c)] || '' : '');
    const obj = { ...(original[id] || {}) };
    obj.sn = get('sn') || undefined;
    if (get('fn')) obj.fn = get('fn');
    if (get('type')) obj.type = get('type');
    const w = numFrom(get('weight'));
    obj.weight = w != null ? w : undefined;
    const tags = splitList(get('tags'));
    obj.tags = tags.length ? tags : undefined;
    const ids = splitList(get('action_ids'));
    obj.action_ids = ids.length ? ids : undefined;
    const bl = get('blocking');
    obj.blocking = bl !== '' ? boolFrom(bl) : undefined;
    obj.stack_limit = numFrom(get('stack_limit')) ?? undefined;
    obj.capacity = numFrom(get('capacity')) ?? undefined;
    if (obj.capacity && !obj.inventory) obj.inventory = {};
    obj.use_target = get('use_target') || undefined;
    obj.use_scope = get('use_scope') || undefined;
    obj.use_limb_filter = get('use_limb_filter') || undefined;
    obj.effect_id = get('effect_id') || undefined;
    const ep = get('effect_params_json');
    if (ep) {
      try { obj.effect_params = JSON.parse(ep); }
      catch { console.warn('effect_params_json parse fail', id); }
    } else {
      delete obj.effect_params;
    }
    out[id] = obj;
  });
  writeJSON(jsonPath, out);
}

function exportActions() {
  const data = readJSON(path.join(__dirname, 'data', 'actions.json'));
  const rows = [['id', 'label', 'repeatable', 'turn_cost', 'effect', 'heal_amount', 'cmd_json']];
  Object.entries(data).forEach(([id, act]) => {
    rows.push([id, act.label || '', act.repeatable ? '1' : '', act.turn_cost != null ? act.turn_cost : '', act.effect || '', act.heal_amount != null ? act.heal_amount : '', act.cmd ? JSON.stringify(act.cmd) : '']);
  });
  const p = path.join(__dirname, 'data', 'actions.csv');
  writeCSVWithBom(p, rows);
  console.log('Exported actions');
}
function importActions() {
  const jsonPath = path.join(__dirname, 'data', 'actions.json');
  const csvPath = path.join(__dirname, 'data', 'actions.csv');
  if (!fs.existsSync(csvPath)) return;
  const original = fs.existsSync(jsonPath) ? readJSON(jsonPath) : {};
  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));
  if (!rows.length) return;
  const h = rows[0], idx = n => h.indexOf(n);
  const out = { ...original };
  rows.slice(1).forEach(row => {
    const id = (row[idx('id')] || '').trim();
    if (!id) return;
    const get = c => (idx(c) >= 0 ? row[idx(c)] || '' : '');
    const act = { ...(original[id] || {}) };
    if (get('label')) act.label = get('label');
    if (get('repeatable') !== '') act.repeatable = boolFrom(get('repeatable'));
    const tc = numFrom(get('turn_cost'));
    act.turn_cost = tc != null ? tc : undefined;
    act.effect = get('effect') || undefined;
    act.heal_amount = numFrom(get('heal_amount')) ?? undefined;
    const cmdJson = get('cmd_json');
    if (cmdJson) try { act.cmd = JSON.parse(cmdJson); } catch (e) { console.warn('cmd_json parse fail', id); }
    out[id] = act;
  });
  writeJSON(jsonPath, out);
}

function exportRaces() {
  const races = readJSON(path.join(__dirname, 'data', 'races.json'));
  const rows = [['id', 'name', 'limbs_head', 'limbs_chest', 'limbs_stomach', 'limbs_l_arm', 'limbs_r_arm', 'limbs_l_leg', 'limbs_r_leg', 'fullness', 'hydration', 'fatigue', 'inventory_size', 'max_weight']];
  races.forEach(r => {
    const bs = r.base_stats || {}, limbs = bs.limbs || {};
    rows.push([r.id || '', r.name || '', limbs.head ?? '', limbs.chest ?? '', limbs.stomach ?? '', limbs.l_arm ?? '', limbs.r_arm ?? '', limbs.l_leg ?? '', limbs.r_leg ?? '', bs.fullness ?? '', bs.hydration ?? '', bs.fatigue ?? '', bs.inventory_size ?? '', bs.max_weight ?? '']);
  });
  const p = path.join(__dirname, 'data', 'races.csv');
  writeCSVWithBom(p, rows);
  console.log('Exported races');
}
function importRaces() {
  const jsonPath = path.join(__dirname, 'data', 'races.json');
  const csvPath = path.join(__dirname, 'data', 'races.csv');
  if (!fs.existsSync(csvPath)) return;
  const original = fs.existsSync(jsonPath) ? readJSON(jsonPath) : [];
  const origMap = {};
  original.forEach(r => { if (r.id) origMap[r.id] = r; });
  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));
  if (!rows.length) return;
  const h = rows[0], idx = n => h.indexOf(n);
  const out = [];
  rows.slice(1).forEach(row => {
    const id = (row[idx('id')] || '').trim();
    if (!id) return;
    const get = c => (idx(c) >= 0 ? row[idx(c)] || '' : '');
    const prev = origMap[id] || { id, base_stats: {} };
    const r = { ...prev };
    r.id = id;
    r.name = get('name') || r.name || '';
    const bs = { ...(r.base_stats || {}) };
    const limbs = { ...(bs.limbs || {}) };
    ['head', 'chest', 'stomach', 'l_arm', 'r_arm', 'l_leg', 'r_leg'].forEach(k => {
      const v = numFrom(get('limbs_' + k));
      if (v != null) limbs[k] = v;
    });
    bs.limbs = limbs;
    ['fullness', 'hydration', 'fatigue', 'inventory_size', 'max_weight'].forEach(k => {
      const v = numFrom(get(k));
      if (v != null) bs[k] = v;
    });
    r.base_stats = bs;
    out.push(r);
  });
  writeJSON(jsonPath, out);
}

function exportBuffs() {
  const data = readJSON(path.join(__dirname, 'data', 'buffs.json'));
  const senRows = [['id', 'condition_type', 'limb', 'ratio', 'stat', 'op', 'val', 'text']];
  (data.sensations || []).forEach(s => {
    let ctype = 'default', limb = '', ratio = '', stat = '', op = '', val = '';
    if (s.condition === 'default') ctype = 'default';
    else if (s.condition && s.condition.limb) { ctype = 'limb'; limb = s.condition.limb; ratio = s.condition.ratio != null ? s.condition.ratio : ''; }
    else if (s.condition && s.condition.stat) { ctype = 'stat'; stat = s.condition.stat; op = s.condition.op || ''; val = s.condition.val != null ? s.condition.val : ''; }
    senRows.push([s.id || '', ctype, limb, ratio, stat, op, val, s.text || '']);
  });
  const senPath = path.join(__dirname, 'data', 'buffs_sensations.csv');
  writeCSVWithBom(senPath, senRows);
  const defRows = [['id', 'name', 'desc', 'type', 'duration', 'required_tags', 'forbidden_tags', 'on_add_json', 'on_tick_json', 'on_remove_json']];
  Object.entries(data.definitions || {}).forEach(([id, def]) => {
    const req = def.requirements || {}, eff = def.effects || {};
    defRows.push([id, def.name || '', def.desc || '', def.type || '', def.duration != null ? def.duration : '', (req.required_tags || []).join(';'), (req.forbidden_tags || []).join(';'), eff.on_add ? JSON.stringify(eff.on_add) : '', eff.on_tick ? JSON.stringify(eff.on_tick) : '', eff.on_remove ? JSON.stringify(eff.on_remove) : '']);
  });
  const defPath = path.join(__dirname, 'data', 'buffs_definitions.csv');
  writeCSVWithBom(defPath, defRows);
  console.log('Exported buffs');
}
function importBuffs() {
  const jsonPath = path.join(__dirname, 'data', 'buffs.json');
  const original = fs.existsSync(jsonPath) ? readJSON(jsonPath) : { sensations: [], definitions: {} };
  let sensations = original.sensations || [];
  const senPath = path.join(__dirname, 'data', 'buffs_sensations.csv');
  if (fs.existsSync(senPath)) {
    const rows = parseCSV(fs.readFileSync(senPath, 'utf8'));
    if (rows.length) {
      const h = rows[0], idx = n => h.indexOf(n);
      sensations = [];
      rows.slice(1).forEach(row => {
        const get = c => (idx(c) >= 0 ? row[idx(c)] || '' : '');
        const id = get('id').trim();
        if (!id) return;
        const ctype = (get('condition_type') || 'default').trim();
        let condition = 'default';
        if (ctype === 'limb') condition = { limb: get('limb') || '', ratio: numFrom(get('ratio')) ?? 0 };
        else if (ctype === 'stat') condition = { stat: get('stat') || '', op: get('op') || 'lt', val: numFrom(get('val')) ?? 0 };
        sensations.push({ id, condition, text: get('text') || '' });
      });
    }
  }
  let definitions = original.definitions || {};
  const defPath = path.join(__dirname, 'data', 'buffs_definitions.csv');
  if (fs.existsSync(defPath)) {
    const rows = parseCSV(fs.readFileSync(defPath, 'utf8'));
    if (rows.length) {
      const h = rows[0], idx = n => h.indexOf(n);
      definitions = {};
      rows.slice(1).forEach(row => {
        const get = c => (idx(c) >= 0 ? row[idx(c)] || '' : '');
        const id = get('id').trim();
        if (!id) return;
        const def = { name: get('name') || '', desc: get('desc') || '', type: get('type') || '' };
        const dur = numFrom(get('duration'));
        if (dur != null) def.duration = dur;
        const reqTags = splitList(get('required_tags')), forbTags = splitList(get('forbidden_tags'));
        if (reqTags.length || forbTags.length) { def.requirements = {}; if (reqTags.length) def.requirements.required_tags = reqTags; if (forbTags.length) def.requirements.forbidden_tags = forbTags; }
        const effects = {};
        if (get('on_add_json')) try { effects.on_add = JSON.parse(get('on_add_json')); } catch (_) {}
        if (get('on_tick_json')) try { effects.on_tick = JSON.parse(get('on_tick_json')); } catch (_) {}
        if (get('on_remove_json')) try { effects.on_remove = JSON.parse(get('on_remove_json')); } catch (_) {}
        if (Object.keys(effects).length) def.effects = effects;
        definitions[id] = def;
      });
    }
  }
  writeJSON(jsonPath, { sensations, definitions });
}

function exportScenes() {
  const scenes = readJSON(path.join(__dirname, 'data', 'scenes.json'));
  const metaRows = [['id', 'name', 'desc', 'cols']];
  Object.entries(scenes).forEach(([id, sc]) => metaRows.push([id, sc.name || '', sc.desc || '', sc.cols != null ? sc.cols : '']));
  const metaPath = path.join(__dirname, 'data', 'scenes_meta.csv');
  writeCSVWithBom(metaPath, metaRows);
  const gridRows = [['scene_id', 'index', 'type', 'sn', 'fn', 'object_id', 'npc_id', 'action_ids', 'acts_json', 'onStep_json', 'blocking']];
  Object.entries(scenes).forEach(([id, sc]) => {
    (sc.grid || []).forEach((cell, idx) => {
      const c = cell || {};
      gridRows.push([id, idx, c.type || '', c.sn || '', c.fn || '', c.object_id || '', c.npc_id || '', (c.action_ids || []).join(';'), c.acts ? JSON.stringify(c.acts) : '', c.onStep ? JSON.stringify(c.onStep) : '', c.blocking ? '1' : '']);
    });
  });
  const gridPath = path.join(__dirname, 'data', 'scenes_grid.csv');
  writeCSVWithBom(gridPath, gridRows);
  console.log('Exported scenes');
}
function importScenes() {
  const jsonPath = path.join(__dirname, 'data', 'scenes.json');
  const scenes = fs.existsSync(jsonPath) ? { ...readJSON(jsonPath) } : {};
  const metaPath = path.join(__dirname, 'data', 'scenes_meta.csv');
  if (fs.existsSync(metaPath)) {
    const rows = parseCSV(fs.readFileSync(metaPath, 'utf8'));
    if (rows.length) {
      const h = rows[0], idx = n => h.indexOf(n);
      rows.slice(1).forEach(row => {
        const get = c => (idx(c) >= 0 ? row[idx(c)] || '' : '');
        const id = get('id').trim();
        if (!id) return;
        const prev = scenes[id] || { grid: [] };
        scenes[id] = { ...prev, name: get('name') || prev.name, desc: get('desc') || prev.desc, cols: numFrom(get('cols')) ?? prev.cols ?? 8, grid: prev.grid || [] };
      });
    }
  }
  const gridPath = path.join(__dirname, 'data', 'scenes_grid.csv');
  if (fs.existsSync(gridPath)) {
    const rows = parseCSV(fs.readFileSync(gridPath, 'utf8'));
    if (rows.length) {
      const h = rows[0], idx = n => h.indexOf(n);
      const byScene = {};
      rows.slice(1).forEach(row => {
        const get = c => (idx(c) >= 0 ? row[idx(c)] || '' : '');
        const sceneId = get('scene_id').trim();
        if (!sceneId) return;
        const index = numFrom(get('index'));
        if (index == null) return;
        if (!byScene[sceneId]) byScene[sceneId] = {};
        const cell = {};
        if (get('type')) cell.type = get('type');
        if (get('sn')) cell.sn = get('sn');
        if (get('fn')) cell.fn = get('fn');
        if (get('object_id')) cell.object_id = get('object_id');
        if (get('npc_id')) cell.npc_id = get('npc_id');
        const aids = splitList(get('action_ids'));
        if (aids.length) cell.action_ids = aids;
        const aj = get('acts_json');
        if (aj) try { cell.acts = JSON.parse(aj); } catch (_) {}
        const oj = get('onStep_json');
        if (oj) try { cell.onStep = JSON.parse(oj); } catch (_) {}
        if (get('blocking') !== '') cell.blocking = boolFrom(get('blocking'));
        byScene[sceneId][index] = cell;
      });
      Object.entries(byScene).forEach(([sid, cells]) => {
        const sc = scenes[sid] || { name: sid, desc: '', cols: 8, grid: [] };
        const maxIdx = Math.max(...Object.keys(cells).map(Number));
        const grid = [];
        for (let i = 0; i <= maxIdx; i++) grid[i] = cells[i] || { type: 'null' };
        sc.grid = grid;
        scenes[sid] = sc;
      });
    }
  }
  writeJSON(jsonPath, scenes);
}

const [, , mode, target] = process.argv;
const TARGETS = ['config', 'npcs', 'objects', 'actions', 'races', 'buffs', 'scenes'];
const exportFns = { config: exportConfig, npcs: exportNpcs, objects: exportObjects, actions: exportActions, races: exportRaces, buffs: exportBuffs, scenes: exportScenes };
const importFns = { config: importConfig, npcs: importNpcs, objects: importObjects, actions: importActions, races: importRaces, buffs: importBuffs, scenes: importScenes };

if (!mode || !target) {
  console.log('Usage: node csv-sync.js <export|import> <' + TARGETS.join('|') + '|all>');
  process.exit(0);
}
if (mode === 'export') {
  if (target === 'all') TARGETS.forEach(t => exportFns[t]()); else if (exportFns[target]) exportFns[target](); else console.error('Unknown target:', target);
} else if (mode === 'import') {
  if (target === 'all') TARGETS.forEach(t => importFns[t]()); else if (importFns[target]) importFns[target](); else console.error('Unknown target:', target);
} else {
  console.error('Unknown mode:', mode);
}
