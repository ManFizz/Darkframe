// Single description of the app's keyboard / mouse shortcuts, grouped by where they
// work. The cheat sheet (HotkeysHelp) is built from this list — when a shortcut is
// added or changed in a component, update it here too. Each entry: { keys, desc },
// where `keys` is a list of key caps pressed together (a "/" item means "or").
// `action` links a remappable shortcut (services/keymap): the sheet then shows the
// user's current keys instead of `keys`.

export const HOTKEY_GROUPS = [
    {
        id: 'viewer',
        title: 'Просмотр',
        icon: 'bi-image',
        items: [
            { keys: ['←', '/', '→'],           desc: 'Предыдущий / следующий файл' },
            { keys: ['Мышь: назад / вперёд'],   desc: 'Предыдущий / следующий файл' },
            { keys: ['1…9'],                    desc: 'Поставить рейтинг (и на NumPad)' },
            { keys: ['0'],                      desc: 'Рейтинг 10; та же цифра ещё раз — снять оценку' },
            { keys: ['S'],                      desc: 'Слайдшоу: запустить / пауза', action: 'viewer.slideshow' },
            { keys: ['T'],                      desc: 'Полоса миниатюр: показать / скрыть', action: 'viewer.filmstrip' },
            { keys: ['Пробел'],                 desc: 'GIF / WebP: пауза / пуск' },
            { keys: [',', '/', '.'],            desc: 'GIF / WebP: кадр назад / вперёд', action: ['media.frameBack', 'media.frameFwd'] },
            { keys: ['Колесо'],                 desc: 'Масштаб изображения (перетаскивание — сдвиг)' },
            { keys: ['Delete'],                 desc: 'В корзину (библиотека)' },
            { keys: ['Enter'],                  desc: 'В избранное (вне библиотеки)' },
            { keys: ['Клик по счётчику'],       desc: 'Перейти к номеру файла' },
            { keys: ['Esc', '/', 'ПКМ'],        desc: 'Закрыть просмотр' },
        ],
    },
    {
        id: 'video',
        title: 'Видео',
        icon: 'bi-film',
        items: [
            { keys: ['Пробел'],                 desc: 'Пуск / пауза' },
            { keys: ['Ctrl', '←', '/', '→'],    desc: 'Перемотка на 10 секунд' },
            { keys: [',', '/', '.'],            desc: 'Кадр назад / вперёд', action: ['media.frameBack', 'media.frameFwd'] },
            { keys: ['<', '/', '>'],            desc: 'Медленнее / быстрее', action: ['video.slower', 'video.faster'] },
            { keys: ['↑', '/', '↓'],            desc: 'Громкость' },
            { keys: ['M'],                      desc: 'Без звука', action: 'video.mute' },
            { keys: ['F'],                      desc: 'Во весь экран', action: 'video.fullscreen' },
            { keys: ['P'],                      desc: 'Картинка в картинке', action: 'video.pip' },
            { keys: ['Двойной клик'],           desc: 'Во весь экран' },
        ],
    },
    {
        id: 'editor',
        title: 'Редактор изображений',
        icon: 'bi-crop',
        items: [
            { keys: ['Колесо'],                 desc: 'Масштаб (до пиксельной сетки)' },
            { keys: ['Перетаскивание фона'],    desc: 'Сдвиг при увеличении' },
            { keys: ['Двойной клик по ползунку'], desc: 'Сбросить цветокоррекцию этого параметра' },
            { keys: ['Esc'],                    desc: 'Выйти без сохранения' },
        ],
    },
    {
        id: 'gallery',
        title: 'Галерея библиотеки',
        icon: 'bi-grid-3x3-gap',
        items: [
            { keys: ['Клик'],                   desc: 'Выбрать файл (панель свойств)' },
            { keys: ['Ctrl', 'Клик'],           desc: 'Добавить / убрать из выделения' },
            { keys: ['Shift', 'Клик'],          desc: 'Выделить диапазон' },
            { keys: ['Ctrl', 'A'],              desc: 'Выделить всё', action: 'common.selectAll' },
            { keys: ['Ctrl', 'I'],              desc: 'Инвертировать выделение', action: 'lib.invert' },
            { keys: ['Esc'],                    desc: 'Снять выделение' },
            { keys: ['Delete'],                 desc: 'Выделенное — в корзину' },
            { keys: ['ПКМ'],                    desc: 'Открыть в просмотре' },
        ],
    },
    {
        id: 'folders',
        title: 'Папки (Folders)',
        icon: 'bi-folder2-open',
        items: [
            { keys: ['Alt', '←', '/', '→'],     desc: 'Назад / вперёд по истории' },
            { keys: ['Мышь: назад / вперёд'],   desc: 'Назад / вперёд по истории' },
            { keys: ['Backspace', '/', 'Alt', '↑'], desc: 'На уровень выше' },
            { keys: ['Ctrl', 'L'],              desc: 'Ввести путь', action: 'fs.path' },
            { keys: ['Ctrl', 'F'],              desc: 'Фильтр по имени', action: 'fs.filter' },
            { keys: ['F5'],                     desc: 'Обновить папку', action: 'fs.refresh' },
            { keys: ['Ctrl', 'Клик', '/', 'Shift', 'Клик'], desc: 'Выделить файл / диапазон' },
            { keys: ['Ctrl', 'A'],              desc: 'Выделить все файлы', action: 'common.selectAll' },
            { keys: ['Esc'],                    desc: 'Снять выделение' },
            { keys: ['F2'],                     desc: 'Переименовать выбранный файл', action: 'fs.rename' },
            { keys: ['Del'],                    desc: 'Выбранные — в корзину Windows' },
            { keys: ['Ctrl', 'Shift', 'N'],     desc: 'Новая папка', action: 'fs.newFolder' },
            { keys: ['Перетащить на папку'],    desc: 'Переместить файлы' },
            { keys: ['Новые / В библиотеке'],   desc: 'Фильтр по наличию в библиотеке (значок-закладка на плитке, «⧉ N» — копии в папке)' },
            { keys: ['ПКМ по папке'],           desc: 'Меню: открыть, переименовать, в корзину, импорт' },
        ],
    },
    {
        id: 'booru',
        title: 'Поиск booru',
        icon: 'bi-search',
        items: [
            { keys: ['Пробел'],                 desc: 'Завершить тег (превратить в чип)' },
            { keys: ['Tab'],                    desc: 'Взять подсказку' },
            { keys: ['↑', '/', '↓'],            desc: 'Выбор подсказки' },
            { keys: ['Enter'],                  desc: 'Искать' },
            { keys: ['-тег'],                   desc: 'Исключить тег' },
            { keys: ['Клик по чипу'],           desc: 'Включить / исключить' },
            { keys: ['Backspace'],              desc: 'Убрать последний тег' },
            { keys: ['Ctrl', '←', '/', '→'],    desc: 'Страница назад / вперёд' },
            { keys: ['Ctrl', 'Клик', '/', 'Shift', 'Клик'], desc: 'Выделить пост / диапазон' },
            { keys: ['Ctrl', 'A'],              desc: 'Выделить все показанные' },
            { keys: ['Перетащить пост'],        desc: 'Сохранить в коллекцию (панель справа)' },
        ],
    },
    {
        id: 'tags',
        title: 'Теги и фильтр',
        icon: 'bi-tags',
        items: [
            { keys: ['Enter'],                  desc: 'Добавить тег' },
            { keys: ['−тег', '/', '!тег'],      desc: 'Исключить тег из фильтра' },
            { keys: ['Клик по тегу фильтра'],   desc: 'Переключить «включить / исключить»' },
            { keys: ['Backspace'],              desc: 'Убрать последний тег из фильтра' },
            { keys: ['a; b; c'],                desc: 'Несколько тегов сразу (через «;»)' },
        ],
    },
    {
        id: 'reader',
        title: 'Читалка манги',
        icon: 'bi-book',
        items: [
            { keys: ['←', '/', '→'],            desc: 'Листать (в режиме «справа налево» ← — дальше)' },
            { keys: ['Пробел', '/', 'PgDn'],     desc: 'Дальше (в ленте — на экран вниз; Shift — назад)' },
            { keys: ['Home', '/', 'End'],        desc: 'Первая / последняя страница' },
            { keys: ['Колесо'],                  desc: 'Листать; Ctrl + колесо — масштаб' },
            { keys: ['+', '/', '−', '/', '0'],   desc: 'Масштаб / сброс' },
            { keys: ['V'],                       desc: 'Режим: страница / разворот / лента', action: 'reader.mode' },
            { keys: ['D'],                       desc: 'Направление чтения', action: 'reader.direction' },
            { keys: ['W'],                       desc: 'Подгонка страницы', action: 'reader.fit' },
            { keys: ['G'],                       desc: 'Миниатюры страниц', action: 'reader.thumbs' },
            { keys: ['A'],                       desc: 'Лента: автопрокрутка', action: 'reader.autoscroll' },
            { keys: ['F'],                       desc: 'Во весь экран', action: 'reader.fullscreen' },
            { keys: ['[', '/', ']'],             desc: 'Предыдущая / следующая глава', action: ['reader.prevChapter', 'reader.nextChapter'] },
            { keys: ['Клик по краю'],            desc: 'Листать; по центру — скрыть панели' },
            { keys: ['Esc'],                     desc: 'Закрыть миниатюры / меню / читалку' },
        ],
    },
    {
        id: 'manga',
        title: 'Манга',
        icon: 'bi-journals',
        items: [
            { keys: ['/'],                       desc: 'Фокус в поиск по источнику' },
            { keys: ['Ссылка в поиск'],          desc: 'Открыть карточку галереи по ссылке' },
            { keys: ['Esc'],                     desc: 'Из карточки — назад к результатам' },
            { keys: ['Ctrl', 'V'],               desc: 'В библиотеке: ссылка на галерею (nhentai, e-hentai, AllHentai, MangaDex) — в очередь загрузки' },
            { keys: ['Del'],                     desc: 'Редактор страниц: выбранные страницы — в «удалённые» (можно вернуть)' },
        ],
    },
    {
        id: 'general',
        title: 'Общее',
        icon: 'bi-keyboard',
        items: [
            { keys: ['?'],                      desc: 'Эта шпаргалка', action: 'app.help' },
            { keys: ['Ctrl', 'K'],              desc: 'Палитра команд: разделы, коллекции, папки, действия', action: 'app.palette' },
            { keys: ['Ctrl', 'Z'],              desc: 'Библиотека: отменить (оценка, перемещение, теги, корзина, импорт)', action: 'lib.undo' },
            { keys: ['Ctrl', 'Y', '/', 'Ctrl', 'Shift', 'Z'], desc: 'Библиотека: повторить отменённое', action: 'lib.redo' },
            { keys: ['Ctrl', 'V'],              desc: 'Библиотека: вставить из буфера (картинку, ссылки, скопированные файлы) в открытую коллекцию', action: 'lib.paste' },
        ],
    },
];

// Which group matters most right now (it's shown first and highlighted).
export function currentHotkeyContext() {
    if (document.querySelector('.img-editor')) return 'editor';
    if (document.querySelector('.rd')) return 'reader';
    const modal = document.querySelector('.modal-view');
    if (modal) return modal.querySelector('video') ? 'video' : 'viewer';
    if (document.querySelector('.mo-layout')) return 'manga';
    if (document.querySelector('.folder-layout')) return 'folders';
    if (document.querySelector('.booru-search')) return 'booru';
    return 'gallery';
}
