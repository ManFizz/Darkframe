// ==UserScript==
// @name         JS Gallery - Yandex Images
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Save images to JS Gallery library
// @match        https://yandex.ru/images/*
// @match        https://yandex.com/images/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      127.0.0.1
// @connect      yandex.ru
// @connect      yandex.com
// ==/UserScript==

(function () {
    'use strict';

    const API = 'http://127.0.0.1:45678';
    const SAVED_KEY = 'jsgallery_saved_urls';
    const thumbToFullUrl = new Map();
    const rimCache = new Map();

    // --- Хранилище ---
    function loadSaved() {
        try { return new Set(JSON.parse(GM_getValue(SAVED_KEY, '[]'))); }
        catch { return new Set(); }
    }
    function markSaved(url) {
        const saved = loadSaved();
        saved.add(normalizeUrl(url));
        GM_setValue(SAVED_KEY, JSON.stringify([...saved]));
    }
    function isSaved(url) { return loadSaved().has(normalizeUrl(url)); }

    // --- Утилиты ---
    function normalizeUrl(src) {
        if (!src) return src;
        return src.startsWith('//') ? 'https:' + src : src;
    }

    function isPlaceholderSrc(src) {
        if (!src) return true;
        if (src.startsWith('data:')) return true;
        const normalized = normalizeUrl(src);
        if (normalized.includes('avatars.mds.yandex.net')) {
            try {
                const url = new URL(normalized);
                const w = parseInt(url.searchParams.get('w') || '0');
                return url.searchParams.get('n') === '33' || w < 300;
            } catch { return true; }
        }
        return false;
    }

    // --- Стили ---
    const style = document.createElement('style');
    style.textContent = `
        .jsg-btn {
            position: absolute; top: 4px; right: 4px;
            width: 28px; height: 28px;
            background: rgba(0,0,0,0.7); border: none; border-radius: 6px;
            cursor: pointer; z-index: 1000;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.15s; padding: 0;
        }
        .jsg-btn:hover { background: rgba(30,30,30,0.95); transform: scale(1.1); }
        .jsg-btn svg { width: 16px; height: 16px; }
        .jsg-btn.saved  { background: rgba(16,185,129,0.9); }
        .jsg-btn.loading { background: rgba(99,102,241,0.9); cursor: wait; }
        .jsg-btn.error  { background: rgba(239,68,68,0.9); }

        .jsg-toast {
            position: fixed; bottom: 24px; left: 50%;
            transform: translateX(-50%);
            background: rgba(15,23,42,0.95); color: white;
            padding: 10px 20px; border-radius: 8px;
            font-family: system-ui, sans-serif; font-size: 13px;
            z-index: 99999; backdrop-filter: blur(8px);
            border: 1px solid rgba(255,255,255,0.1);
            white-space: nowrap; animation: jsg-in 0.2s ease;
        }
        .jsg-toast.success { border-color: rgba(16,185,129,0.5); }
        .jsg-toast.error   { border-color: rgba(239,68,68,0.5); }
        .jsg-toast.warn    { border-color: rgba(245,158,11,0.5); }
        @keyframes jsg-in {
            from { opacity: 0; transform: translateX(-50%) translateY(8px); }
            to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes jsg-spin {
            from { transform: rotate(0deg); } to { transform: rotate(360deg); }
        }

        .jsg-viewer-btn {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 10px 16px; background: rgba(99,102,241,0.9);
            border: none; border-radius: 8px; color: white;
            font-family: system-ui, sans-serif; font-size: 13px; font-weight: 500;
            cursor: pointer; transition: all 0.15s; margin-left: 8px;
        }
        .jsg-viewer-btn:hover  { background: rgba(79,70,229,1); }
        .jsg-viewer-btn.saved  { background: rgba(16,185,129,0.9); cursor: default; }
        .jsg-viewer-btn.loading { background: rgba(99,102,241,0.6); cursor: wait; }
    `;
    document.head.appendChild(style);

    // --- Иконки ---
    const ICON_SAVE = `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>`;
    const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"/>
    </svg>`;
    const ICON_SPIN = `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"
        style="animation: jsg-spin 0.8s linear infinite">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/>
    </svg>`;

    // --- Toast ---
    let toastTimer = null;
    function showToast(message, type = 'info', duration = 2500) {
        document.querySelectorAll('.jsg-toast').forEach(t => t.remove());
        clearTimeout(toastTimer);
        const toast = document.createElement('div');
        toast.className = `jsg-toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        toastTimer = setTimeout(() => toast.remove(), duration);
    }

    // --- GM fetch ---
    function gmFetch(url, options = {}) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method:    options.method || 'GET',
                url,
                headers:   options.headers || {},
                data:      options.body || null,
                timeout:   options.timeout || 10000,
                onload:    (res) => resolve({
                    ok:   res.status >= 200 && res.status < 300,
                    status: res.status,
                    json: () => JSON.parse(res.responseText),
                }),
                onerror:   (e) => {
                    console.error('[gmFetch error]', url, e);
                    reject(new Error('Network error'));
                },
                ontimeout: () => {
                    console.error('[gmFetch timeout]', url);
                    reject(new Error('Timeout'));
                },
            });
        });
    }

    // --- Локальный API ---
    async function checkOnline() {
        try { return (await gmFetch(`${API}/api/ping`, { timeout: 2000 })).ok; }
        catch { return false; }
    }

    async function saveToGallery({ url, sourceUrl, title }) {
        const res = await gmFetch(`${API}/api/add`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ url, sourceUrl, title }),
            timeout: 120000,
        });
        return res.json();
    }

    // --- Rim API ---
    async function fetchRimPage(docid) {
        const text = new URLSearchParams(window.location.search).get('text') || '';
        const url = `${API}/api/rim?docid=${docid}&text=${encodeURIComponent(text)}`;

        const res = await gmFetch(url);

        if (!res.ok) {
            console.error('[rim] bad status:', res.status);
            return;
        }

        const data = res.json();

        if (Array.isArray(data.rld)) {
            data.rld.forEach(item => {
                if (!item.s?.length) return;
                const entry = {
                    sources:   item.s.map(s => ({ imageUrl: s.iu, sourceUrl: s.pu, title: s.t || '' })),
                    imageUrl:  item.s[0].iu,
                    sourceUrl: item.s[0].pu,
                    title:     item.s[0].t || '',
                };

                if (item.id)  rimCache.set(item.id,  entry);
                if (item.tid) rimCache.set(item.tid, entry); // ← добавь
            });
        }
    }

    async function getImageData(docid, thumbItem) {
        if (rimCache.has(docid)) return rimCache.get(docid);

        await fetchRimPage(docid);
        if (rimCache.has(docid)) return rimCache.get(docid);

        // Пробуем найти по tid из src превью
        if (thumbItem) {
            const img = thumbItem.querySelector('img');
            const src = img?.src || '';
            try {
                const url = new URL(normalizeUrl(src));
                const idParam = url.searchParams.get('id'); // b8b736bcf6346d3c3f4868ad1bd0f1b9-9380290-images-thumbs
                if (idParam) {
                    // tid это первая часть до первого '-'
                    const tid = idParam.split('-')[0];
                    if (rimCache.has(tid)) return rimCache.get(tid);
                }
            } catch {}
        }

        return null;
    }

    // --- Данные открытого просмотрщика ---
    function extractViewerData() {
        for (const el of [
            document.querySelector('.MMImage-Origin'),
            document.querySelector('.MMImage-Preview'),
        ]) {
            if (el?.src && !isPlaceholderSrc(normalizeUrl(el.src))) {
                const src      = normalizeUrl(el.src);
                const titleEl  = document.querySelector('.MMOrganicSnippet-Title');
                return {
                    src,
                    title:     titleEl?.textContent?.trim() || el.alt || '',
                    sourceUrl: titleEl?.href || '',
                };
            }
        }
        return null;
    }

    // --- Сохранение ---
    function markAllButtons(url) {
        document.querySelectorAll('.jsg-btn').forEach(b => {
            const img = b.closest('.RelatedImages-Item, .serp-item')?.querySelector('img');
            if (img && thumbToFullUrl.get(img.src) === url) {
                b.innerHTML = ICON_CHECK;
                b.className = 'jsg-btn saved';
                b.title = 'Уже в библиотеке';
            }
        });
    }

    async function doSave(url, sourceUrl, title, btn, isViewerBtn = false) {
        showToast('⏳ Скачивание...', 'info', 120000);
        try {
            const result = await saveToGallery({ url, sourceUrl, title });
            document.querySelectorAll('.jsg-toast').forEach(t => t.remove());

            if (result.skipped || result.ok) {
                markSaved(url);
                showToast(result.skipped ? `⚠️ Уже есть: ${result.existingTitle}` : '✓ Сохранено',
                    result.skipped ? 'warn' : 'success');

                if (isViewerBtn) {
                    btn.innerHTML = `${ICON_CHECK} В библиотеке`;
                    btn.classList.replace('loading', 'saved');
                } else {
                    btn.innerHTML = ICON_CHECK;
                    btn.className = 'jsg-btn saved';
                    btn.title = 'Уже в библиотеке';
                    markAllButtons(url);
                }
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (e) {
            document.querySelectorAll('.jsg-toast').forEach(t => t.remove());
            showToast(`❌ ${e.message}`, 'error');
            if (isViewerBtn) {
                btn.innerHTML = `${ICON_SAVE} Сохранить`;
                btn.classList.remove('loading');
            } else {
                btn.innerHTML = ICON_SAVE;
                btn.classList.remove('loading');
                btn.classList.add('error');
                setTimeout(() => btn.classList.remove('error'), 2000);
            }
        }
    }

    // В saveFromThumb — перебираем источники при ошибке
    async function saveFromThumb(thumbItem, btn) {
        if (!await checkOnline()) {
            showToast('❌ JS Gallery не запущен', 'error');
            return;
        }

        btn.innerHTML = ICON_SPIN;
        btn.classList.add('loading');

        try {
            const docid = thumbItem.id;
            if (!docid) throw new Error('Нет docid');

            const data = await getImageData(docid, thumbItem);
            if (!data?.sources?.length) throw new Error('Нет источников');

            const thumbImg = thumbItem.querySelector('img');
            let lastError = null;

            // Перебираем все доступные источники
            for (const source of data.sources) {
                const url = normalizeUrl(source.imageUrl);
                if (!url) continue;

                showToast(`⏳ Скачивание... (${data.sources.indexOf(source) + 1}/${data.sources.length})`, 'info', 120000);

                try {
                    const saveResult = await saveToGallery({
                        url,
                        sourceUrl: source.sourceUrl || window.location.href,
                        title:     source.title || thumbImg?.alt || '',
                    });

                    document.querySelectorAll('.jsg-toast').forEach(t => t.remove());

                    if (saveResult.ok || saveResult.skipped) {
                        if (thumbImg?.src) thumbToFullUrl.set(thumbImg.src, url);
                        markSaved(url);
                        showToast(
                            saveResult.skipped ? `⚠️ Уже есть: ${saveResult.existingTitle}` : '✓ Сохранено',
                            saveResult.skipped ? 'warn' : 'success'
                        );
                        btn.innerHTML = ICON_CHECK;
                        btn.className = 'jsg-btn saved';
                        btn.title = 'Уже в библиотеке';
                        markAllButtons(url);
                        return; // успех — выходим
                    }

                    lastError = new Error(saveResult.error || 'Unknown error');
                } catch (e) {
                    lastError = e;
                    console.warn(`[JSGallery] source failed: ${url}`, e.message);
                    // Продолжаем к следующему источнику
                }
            }

            // Все источники исчерпаны
            throw lastError || new Error('Все источники недоступны');

        } catch (e) {
            document.querySelectorAll('.jsg-toast').forEach(t => t.remove());
            showToast(`❌ ${e.message}`, 'error');
            btn.innerHTML = ICON_SAVE;
            btn.classList.remove('loading');
            btn.classList.add('error');
            setTimeout(() => btn.classList.remove('error'), 2000);
        }
    }

    // --- Кнопки ---
    function addButtonToThumb(item) {
        if (item.querySelector('.jsg-btn')) return;
        const img = item.querySelector('img');
        if (!img) return;

        const fullUrl = thumbToFullUrl.get(img.src);
        const saved   = fullUrl ? isSaved(fullUrl) : false;

        const btn = document.createElement('button');
        btn.className = `jsg-btn ${saved ? 'saved' : ''}`;
        btn.innerHTML = saved ? ICON_CHECK : ICON_SAVE;
        btn.title     = saved ? 'Уже в библиотеке' : 'Сохранить в JS Gallery';

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (btn.classList.contains('saved') || btn.classList.contains('loading')) return;
            saveFromThumb(item, btn);
        });

        item.style.position = 'relative';
        item.appendChild(btn);
    }

    function addViewerButton() {
        const container = document.querySelector('.MMViewerButtons-Inline');
        if (!container) return;

        const data = extractViewerData();
        if (!data) return;

        const existing = container.querySelector('.jsg-viewer-btn');
        if (existing?.dataset.src === data.src) return;
        existing?.remove();

        const saved = isSaved(data.src);
        const btn   = document.createElement('button');
        btn.className    = `jsg-viewer-btn ${saved ? 'saved' : ''}`;
        btn.dataset.src  = data.src;
        btn.innerHTML    = saved ? `${ICON_CHECK} В библиотеке` : `${ICON_SAVE} Сохранить`;
        btn.type         = 'button';

        btn.addEventListener('click', async () => {
            if (btn.classList.contains('saved') || btn.classList.contains('loading')) return;
            if (!await checkOnline()) { showToast('❌ JS Gallery не запущен', 'error'); return; }

            btn.innerHTML = `${ICON_SPIN} Сохранение...`;
            btn.classList.add('loading');

            const current = extractViewerData();
            if (!current?.src) return;

            await doSave(current.src, current.sourceUrl || window.location.href, current.title, btn, true);
        });

        container.appendChild(btn);
    }

    // --- Прогрев кэша ---
    function warmupCache() {
        const items = document.querySelectorAll('.RelatedImages-Item[id], .serp-item[id]');
        const docids = Array.from(items).map(el => el.id).filter(id => id && !rimCache.has(id));
        if (!docids.length) return;
        fetchRimPage(docids[0]).catch(() => {});
    }

    function processItems() {
        document.querySelectorAll('.RelatedImages-Item, .serp-item').forEach(addButtonToThumb);
    }

    // --- MutationObserver ---
    let viewerTimer = null;
    const observer = new MutationObserver((mutations) => {
        let hasItems = false, hasViewer = false;

        for (const m of mutations) {
            if (m.target.classList?.contains('jsg-btn') ||
                m.target.classList?.contains('jsg-viewer-btn')) continue;

            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.classList?.contains('RelatedImages-Item') ||
                    node.classList?.contains('serp-item') ||
                    node.querySelector?.('.RelatedImages-Item, .serp-item')) hasItems = true;
                if (node.querySelector?.('.MMViewerButtons-Inline, .MMImage-Origin')) hasViewer = true;
            }

            if (m.type === 'attributes' && m.attributeName === 'src' &&
                (m.target.classList?.contains('MMImage-Origin') ||
                    m.target.classList?.contains('MMImage-Preview'))) hasViewer = true;
        }

        if (hasItems) { processItems(); setTimeout(warmupCache, 500); }
        if (hasViewer) { clearTimeout(viewerTimer); viewerTimer = setTimeout(addViewerButton, 200); }
    });

    observer.observe(document.body, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ['src'],
    });

    processItems();
    setTimeout(warmupCache, 1000);
})();