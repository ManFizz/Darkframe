// ==UserScript==
// @name         JS Gallery - Drag & Drop
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Drag images to save to JS Gallery library
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// ==/UserScript==

(function () {
    'use strict';

    const API = 'http://127.0.0.1:45678';

    let draggedSrc = null;
    let dropZone = null;

    function gmFetch(url, options = {}) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method:    options.method || 'GET',
                url,
                headers:   options.headers || {},
                data:      options.body || null,
                timeout:   120000,
                onload:    (res) => resolve({
                    ok:   res.status >= 200 && res.status < 300,
                    json: () => JSON.parse(res.responseText),
                }),
                onerror:   () => reject(new Error('Network error')),
                ontimeout: () => reject(new Error('Timeout')),
            });
        });
    }

    function showToast(message, ok = true) {
        const existing = document.getElementById('__jsg_drop_toast__');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = '__jsg_drop_toast__';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed; bottom: 24px; right: 24px;
            background: ${ok ? 'rgba(16,185,129,0.95)' : 'rgba(239,68,68,0.9)'};
            color: white; padding: 12px 20px; border-radius: 10px;
            font-family: system-ui, sans-serif; font-size: 14px;
            z-index: 2147483647; backdrop-filter: blur(8px);
            animation: __jsg_fade__ 2.5s forwards;
        `;

        if (!document.querySelector('#__jsg_anim__')) {
            const s = document.createElement('style');
            s.id = '__jsg_anim__';
            s.textContent = `@keyframes __jsg_fade__ {
                0%,70% { opacity:1; transform:translateY(0); }
                100%   { opacity:0; transform:translateY(8px); }
            }`;
            document.head.appendChild(s);
        }

        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
    }

    function showDropZone() {
        if (dropZone) return;

        if (!document.querySelector('#__jsg_drop_style__')) {
            const style = document.createElement('style');
            style.id = '__jsg_drop_style__';
            style.textContent = `
                #__jsg_drop__ {
                    position: fixed; bottom: 24px; right: 24px;
                    width: 160px; height: 160px;
                    background: rgba(15,23,42,0.9);
                    border: 2px dashed rgba(99,102,241,0.8);
                    border-radius: 16px; z-index: 2147483646;
                    display: flex; align-items: center; justify-content: center;
                    backdrop-filter: blur(8px);
                    transition: all 0.15s ease; cursor: copy;
                }
                #__jsg_drop__.over {
                    background: rgba(99,102,241,0.3);
                    border-color: rgb(99,102,241);
                    transform: scale(1.05);
                }
                #__jsg_drop__ .__inner__ {
                    display: flex; flex-direction: column;
                    align-items: center; gap: 8px; color: white;
                    font-family: system-ui, sans-serif; font-size: 13px;
                    text-align: center; pointer-events: none; padding: 12px;
                }
                #__jsg_drop__ svg { width: 36px; height: 36px; color: rgb(99,102,241); }
            `;
            document.head.appendChild(style);
        }

        dropZone = document.createElement('div');
        dropZone.id = '__jsg_drop__';
        dropZone.innerHTML = `
            <div class="__inner__">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span>Сохранить в библиотеку</span>
            </div>
        `;

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('over');
        });

        dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            hideDropZone();

            if (!draggedSrc) return;

            const url       = draggedSrc;
            const sourceUrl = window.location.href;
            draggedSrc = null;

            showToast('⏳ Сохранение...', true);

            try {
                const res = await gmFetch(`${API}/api/add`, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ url, sourceUrl }),
                });

                const data = res.json();

                if (data.skipped) {
                    showToast(`⚠️ Уже есть: ${data.existingTitle}`, false);
                } else if (data.ok) {
                    showToast('✓ Сохранено в библиотеку');
                } else {
                    showToast(`❌ ${data.error || 'Ошибка'}`, false);
                }
            } catch (err) {
                showToast('❌ Приложение не запущено', false);
            }
        });

        document.body.appendChild(dropZone);
    }

    function hideDropZone() {
        if (dropZone) {
            dropZone.remove();
            dropZone = null;
        }
    }

    document.addEventListener('dragstart', (e) => {
        const el = e.target;
        if (el.tagName === 'IMG') {
            draggedSrc = el.src;
        } else if (el.tagName === 'VIDEO') {
            draggedSrc = el.src || el.querySelector('source')?.src;
        } else {
            draggedSrc = null;
            return;
        }
        if (draggedSrc) showDropZone();
    }, true);

    document.addEventListener('dragend', () => {
        draggedSrc = null;
        setTimeout(hideDropZone, 200);
    }, true);

})();