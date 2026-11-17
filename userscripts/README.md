# Darkframe userscript

Один скрипт Violentmonkey на все сайты. Общий код в `core/`, сайты в `sites/`.

| Что | Где |
| --- | --- |
| Внешний вид (цвета, панель, кнопки) | `core/styles.js` |
| Панель | `core/panel.js` |
| Скрытие скачанного, кнопки у постов, запуск загрузок | `core/main.js` |
| Очередь, счётчики, проверка «уже в библиотеке» | `core/runner.js` |
| API Darkframe | `core/app.js` |
| Настройки и список скачанного | `core/store.js` |
| Запросы, ожидание при 429 | `core/http.js` |
| Сайты | `sites/*.js`, список в `sites/index.js` |

## Установка и обновление

Приложение само собирает скрипт и отдаёт его по адресу
http://127.0.0.1:45678/userscripts/darkframe.user.js — откройте его при запущенном
Darkframe, Violentmonkey предложит установить. Этот же адрес стоит в `@updateURL`:
после правок в `core/` или `sites/` достаточно «Проверить обновления» в
Violentmonkey, ничего не копируя.

Собрать файл вручную: `npm run userscripts` → `userscripts/dist/darkframe.user.js`.

## Новый сайт

1. `sites/<сайт>.js` — модуль с описанием сайта (что он описывает — в шапке
   `core/main.js`; за образец можно взять `sites/redgifs.js`).
2. Строка в `sites/index.js`.
3. Тест на разбор данных сайта в `test/userscripts.test.js`.

Сайт, которому не место в репозитории, — в `sites/private/` (папка в `.gitignore`):
сборка подключает всё оттуда сама, строка в `index.js` не нужна.

Если страница сайта — это одно видео, хватит шаблона `core/videoPage.js`: сайт
описывает только, как узнать страницу видео и что с неё взять (пример —
`sites/private/xfree.js`). Чтение страниц (meta, JSON-LD, загрузка другой
страницы) — `core/html.js`.

Модуль пишется в CommonJS (`require` / `module.exports`) и при загрузке ничего не
делает со страницей — сборка читает из него `hosts` и `connect` для шапки скрипта.
