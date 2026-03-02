/**
 * SaveManager — 单存档 · AES-256-GCM 加密 · 密码保护 · 文件导入导出
 *
 * 加密方案：
 *   PBKDF2(password, salt, 100000 iters, SHA-256) → AES-256-GCM key
 *   key 仅在登录时派生一次，之后保存在内存中供自动存档使用。
 *   localStorage 中只存加密密文；明文永远不落盘。
 */
const SaveManager = (() => {
    const LS_META = 'wys_meta';   // { username, salt_hex }  明文
    const LS_SAVE = 'wys_save';   // { iv_hex, data_hex }     密文

    let _key = null;              // 会话期间的 CryptoKey，注销时清除
    let _saveTimer = null;        // 自动存档防抖 timer

    /* ── 工具函数 ───────────────────────────────────────────── */
    const _enc = new TextEncoder();
    const _dec = new TextDecoder();
    const _toHex = b => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
    const _fromHex = h => { const a = new Uint8Array(h.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16); return a; };

    /* ── 加密原语 ───────────────────────────────────────────── */
    async function _deriveKey(password, saltBytes) {
        const km = await crypto.subtle.importKey('raw', _enc.encode(password), 'PBKDF2', false, ['deriveKey']);
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
            km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
        );
    }

    async function _encrypt(key, plaintext) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, _enc.encode(plaintext));
        return { iv_hex: _toHex(iv), data_hex: _toHex(new Uint8Array(ct)) };
    }

    async function _decrypt(key, iv_hex, data_hex) {
        const plain = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: _fromHex(iv_hex) }, key, _fromHex(data_hex)
        );
        return _dec.decode(plain);
    }

    /* ── 公共 API ───────────────────────────────────────────── */
    function hasSave() { return !!localStorage.getItem(LS_META); }
    function getMeta() { const r = localStorage.getItem(LS_META); return r ? JSON.parse(r) : null; }

    async function createAccount(username, password) {
        if (!username.trim() || !password) throw new Error('用户名和密码不能为空');
        const salt = crypto.getRandomValues(new Uint8Array(16));
        _key = await _deriveKey(password, salt);
        localStorage.setItem(LS_META, JSON.stringify({ username: username.trim(), salt_hex: _toHex(salt) }));
        localStorage.removeItem(LS_SAVE);
    }

    /** 返回解密后的存档对象，或 null（新存档）。密码错误则抛出。 */
    async function login(password) {
        const meta = getMeta();
        if (!meta) throw new Error('存档不存在');
        const key = await _deriveKey(password, _fromHex(meta.salt_hex));
        const raw = localStorage.getItem(LS_SAVE);
        if (raw) {
            const { iv_hex, data_hex } = JSON.parse(raw);
            const json = await _decrypt(key, iv_hex, data_hex); // 密码错误会抛出
            _key = key;
            return JSON.parse(json);
        }
        _key = key;
        return null; // 有账户但尚无存档（刚注册）
    }

    /** 立即将当前 Engine 状态加密写入 localStorage */
    async function save() {
        if (!_key || typeof Engine === 'undefined' || !Engine.state) return;
        const blob = {
            version: 1,
            state: Engine.state,
            time: Engine.time,
            flags: Engine.flags,
            npcStates: Engine.npcStates,
            curId: Engine.curId,
            pIdx: Engine.pIdx,
            lastDecayDay: Engine.lastDecayDay,
            dehydrationAccum: Engine.dehydrationAccum,
        };
        const enc = await _encrypt(_key, JSON.stringify(blob));
        localStorage.setItem(LS_SAVE, JSON.stringify(enc));
    }

    /** render() 调用此函数；防抖 2 秒，避免高频写入 */
    function scheduleSave() {
        if (!_key) return;
        clearTimeout(_saveTimer);
        _saveTimer = setTimeout(() => save(), 2000);
    }

    /** 导出加密存档文件（含 meta + 密文） */
    async function exportSave() {
        const meta = getMeta();
        const raw = localStorage.getItem(LS_SAVE);
        if (!meta) throw new Error('没有存档可导出');
        // 如果有未写入的变动，先立即保存
        if (_key) await save();
        const exportObj = { meta, save: raw ? JSON.parse(raw) : null };
        const blob = new Blob([JSON.stringify(exportObj)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${meta.username}_wys_backup.json`; a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * 从文件导入存档。
     * @param {File} file  - 之前导出的 .json 文件
     * @param {string} password - 该存档的密码
     * @returns {{ meta, saveData }} saveData 为解密后的对象，null 表示空存档
     */
    async function importSave(file, password) {
        const text = await file.text();
        const { meta, save: saveBlob } = JSON.parse(text);
        const key = await _deriveKey(password, _fromHex(meta.salt_hex));
        let saveData = null;
        if (saveBlob) {
            const json = await _decrypt(key, saveBlob.iv_hex, saveBlob.data_hex);
            saveData = JSON.parse(json);
        }
        // 写入本机 localStorage
        _key = key;
        localStorage.setItem(LS_META, JSON.stringify(meta));
        if (saveBlob) localStorage.setItem(LS_SAVE, JSON.stringify(saveBlob));
        else localStorage.removeItem(LS_SAVE);
        return { meta, saveData };
    }

    function logout() { _key = null; clearTimeout(_saveTimer); }

    /* ── 登录界面 ───────────────────────────────────────────── */
    function _injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
#save-overlay {
    position: fixed; inset: 0; z-index: 9999;
    background: #0a0a0f;
    display: flex; align-items: center; justify-content: center;
    font-family: "Noto Serif SC", "Source Han Serif CN", serif;
}
.save-dialog {
    background: #12121a;
    border: 1px solid #3a3a50;
    border-radius: 4px;
    padding: 36px 40px;
    width: 340px;
    box-shadow: 0 8px 40px rgba(0,0,0,.7);
    display: flex; flex-direction: column; gap: 12px;
}
.save-title {
    text-align: center; color: #c8a96e; font-size: 1.5rem;
    letter-spacing: .2em; margin: 0 0 8px;
}
.save-subtitle {
    text-align: center; color: #888; font-size: .85rem; margin: -4px 0 4px;
    letter-spacing: .05em;
}
.save-input {
    width: 100%; box-sizing: border-box;
    background: #1c1c2a; border: 1px solid #3a3a50; border-radius: 3px;
    color: #ddd; padding: 9px 12px; font-size: .9rem;
    outline: none; font-family: inherit;
}
.save-input:focus { border-color: #c8a96e; }
.save-btn {
    width: 100%; padding: 10px; border-radius: 3px; border: none;
    font-size: .9rem; cursor: pointer; font-family: inherit;
    letter-spacing: .05em; transition: opacity .15s;
}
.save-btn:hover { opacity: .85; }
.save-btn--primary { background: #c8a96e; color: #0a0a0f; font-weight: bold; }
.save-btn--secondary { background: #2a2a3a; color: #ccc; border: 1px solid #3a3a50; }
.save-btn--ghost { background: transparent; color: #666; font-size: .82rem; }
.save-btn--danger { background: #5a1a1a; color: #e88; border: 1px solid #8a3a3a; }
.save-error { color: #e88; font-size: .82rem; min-height: 1.2em; text-align: center; }
.save-hint { color: #666; font-size: .8rem; margin: 0; text-align: center; }
.save-divider { border: none; border-top: 1px solid #2a2a3a; margin: 4px 0; }
.save-file-row { display: flex; gap: 8px; align-items: center; }
.save-file-label {
    flex: 1; background: #1c1c2a; border: 1px solid #3a3a50; border-radius: 3px;
    color: #888; padding: 9px 12px; font-size: .82rem; cursor: pointer;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.save-file-input-hidden { display: none; }
.save-loading { text-align: center; color: #888; font-size: .85rem; padding: 8px 0; }
        `;
        document.head.appendChild(style);
    }

    function _setError(id, msg) { document.getElementById(id).textContent = msg; }
    function _clearError(id) { document.getElementById(id).textContent = ''; }
    function _setLoading(view, loading) {
        view.querySelectorAll('button').forEach(b => b.disabled = loading);
        view.querySelectorAll('input').forEach(i => i.disabled = loading);
    }

    function showLoginScreen() {
        _injectStyles();

        const overlay = document.createElement('div');
        overlay.id = 'save-overlay';

        const hasExisting = hasSave();
        const meta = getMeta();

        overlay.innerHTML = `
<div class="save-dialog">
    <h1 class="save-title">潮碧物语</h1>

    <!-- 登录面板 -->
    <div id="sv-login" ${hasExisting ? '' : 'style="display:none"'}>
        <p class="save-subtitle" id="sv-welcome">欢迎回来，${meta ? meta.username : ''}</p>
        <input type="password" id="sv-pw" class="save-input" placeholder="输入密码" autocomplete="current-password">
        <div class="save-error" id="sv-login-err"></div>
        <button id="sv-login-btn" class="save-btn save-btn--primary">进入游戏</button>
        <button id="sv-export-btn" class="save-btn save-btn--secondary">导出存档备份</button>
        <button id="sv-switch-btn" class="save-btn save-btn--ghost">创建新存档 / 导入存档</button>
    </div>

    <!-- 注册 / 导入面板 -->
    <div id="sv-create" ${hasExisting ? 'style="display:none"' : ''}>
        ${hasExisting ? '<p class="save-hint">⚠ 创建新存档将覆盖当前存档。请先导出备份。</p>' : ''}
        <input type="text" id="sv-uname" class="save-input" placeholder="用户名" autocomplete="username">
        <input type="password" id="sv-newpw" class="save-input" placeholder="密码" autocomplete="new-password">
        <input type="password" id="sv-cfpw" class="save-input" placeholder="确认密码" autocomplete="new-password">
        <div class="save-error" id="sv-create-err"></div>
        <button id="sv-create-btn" class="save-btn save-btn--primary">创建存档并开始游戏</button>
        <div class="save-divider"></div>
        <p class="save-hint">或导入已有存档文件：</p>
        <div class="save-file-row">
            <label class="save-file-label" id="sv-file-label" for="sv-file-input">选择存档文件…</label>
            <input type="file" id="sv-file-input" class="save-file-input-hidden" accept=".json">
        </div>
        <input type="password" id="sv-import-pw" class="save-input" placeholder="存档文件的密码" style="display:none" autocomplete="current-password">
        <button id="sv-import-btn" class="save-btn save-btn--secondary" style="display:none">导入存档</button>
        <div class="save-error" id="sv-import-err"></div>
        ${hasExisting ? '<button id="sv-back-btn" class="save-btn save-btn--ghost">返回</button>' : ''}
    </div>
</div>`;

        document.body.appendChild(overlay);

        // ── 登录面板事件 ───────────────────────────────────────
        const loginView = overlay.querySelector('#sv-login');
        const createView = overlay.querySelector('#sv-create');

        function _switchTo(view) {
            loginView.style.display = 'none';
            createView.style.display = 'none';
            view.style.display = '';
        }

        async function _doLogin() {
            const pw = document.getElementById('sv-pw').value;
            _clearError('sv-login-err');
            _setLoading(loginView, true);
            try {
                const savedData = await login(pw);
                _finishLogin(savedData);
            } catch (_) {
                _setError('sv-login-err', '密码错误，请重试。');
                _setLoading(loginView, false);
            }
        }

        if (loginView.style.display !== 'none') {
            overlay.querySelector('#sv-login-btn').addEventListener('click', _doLogin);
            overlay.querySelector('#sv-pw').addEventListener('keydown', e => { if (e.key === 'Enter') _doLogin(); });

            overlay.querySelector('#sv-export-btn').addEventListener('click', async () => {
                const pw = document.getElementById('sv-pw').value;
                if (!pw) { _setError('sv-login-err', '请先输入密码再导出。'); return; }
                try {
                    await login(pw); // 验证密码后立即导出
                    await exportSave();
                } catch (_) { _setError('sv-login-err', '密码错误，无法导出。'); }
            });

            overlay.querySelector('#sv-switch-btn').addEventListener('click', () => {
                _clearError('sv-login-err');
                _switchTo(createView);
            });
        }

        // ── 注册面板事件 ────────────────────────────────────────
        async function _doCreate() {
            const uname = document.getElementById('sv-uname').value.trim();
            const pw = document.getElementById('sv-newpw').value;
            const cf = document.getElementById('sv-cfpw').value;
            _clearError('sv-create-err');
            if (!uname) { _setError('sv-create-err', '请输入用户名。'); return; }
            if (!pw) { _setError('sv-create-err', '请输入密码。'); return; }
            if (pw !== cf) { _setError('sv-create-err', '两次密码不一致。'); return; }
            _setLoading(createView, true);
            try {
                await createAccount(uname, pw);
                _finishLogin(null);
            } catch (e) {
                _setError('sv-create-err', e.message || '创建失败。');
                _setLoading(createView, false);
            }
        }

        overlay.querySelector('#sv-create-btn').addEventListener('click', _doCreate);
        overlay.querySelector('#sv-newpw').addEventListener('keydown', e => {
            if (e.key === 'Enter') document.getElementById('sv-cfpw').focus();
        });
        overlay.querySelector('#sv-cfpw').addEventListener('keydown', e => {
            if (e.key === 'Enter') _doCreate();
        });

        // 文件选择
        const fileInput = overlay.querySelector('#sv-file-input');
        const importPwInput = overlay.querySelector('#sv-import-pw');
        const importBtn = overlay.querySelector('#sv-import-btn');

        fileInput.addEventListener('change', () => {
            if (fileInput.files.length) {
                overlay.querySelector('#sv-file-label').textContent = fileInput.files[0].name;
                importPwInput.style.display = '';
                importBtn.style.display = '';
            }
        });

        importBtn.addEventListener('click', async () => {
            const file = fileInput.files[0];
            const pw = importPwInput.value;
            _clearError('sv-import-err');
            if (!file || !pw) { _setError('sv-import-err', '请选择文件并输入密码。'); return; }
            _setLoading(createView, true);
            try {
                const { saveData } = await importSave(file, pw);
                _finishLogin(saveData);
            } catch (_) {
                _setError('sv-import-err', '导入失败：文件损坏或密码错误。');
                _setLoading(createView, false);
            }
        });

        const backBtn = overlay.querySelector('#sv-back-btn');
        if (backBtn) backBtn.addEventListener('click', () => _switchTo(loginView));

        // ── 进入游戏 ────────────────────────────────────────────
        function _finishLogin(savedData) {
            overlay.remove();
            Engine.startGame(savedData);
        }
    }

    return { hasSave, getMeta, createAccount, login, save, scheduleSave, exportSave, importSave, logout, showLoginScreen };
})();
