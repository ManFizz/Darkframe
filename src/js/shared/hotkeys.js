// Single description of the app's keyboard / mouse shortcuts, grouped by where they
// work. The cheat sheet (HotkeysHelp) is built from this list — when a shortcut is
// added or changed in a component, update it here too. Each entry: { keys, desc },
// where `keys` is a list of key caps pressed together (a "/" item means "or").

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
            { keys: ['S'],                      desc: 'Слайдшоу: запустить / пауза' },
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
            { keys: [',', '/', '.'],            desc: 'Кадр назад / вперёд' },
            { keys: ['<', '/', '>'],            desc: 'Медленнее / быстрее' },
            { keys: ['↑', '/', '↓'],            desc: 'Громкость' },
            { keys: ['M'],                      desc: 'Без звука' },
            { keys: ['F'],                      desc: 'Во весь экран' },
            { keys: ['P'],                      desc: 'Картинка в картинке' },
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
            { keys: ['Ctrl', 'A'],              desc: 'Выделить всё' },
            { keys: ['Ctrl', 'I'],              desc: 'Инвертировать выделение' },
            { keys: ['Esc'],                    desc: 'Снять выделение' },
            { keys: ['Delete'],                 desc: 'Выделенное — в корзину' },
            { keys: ['ПКМ'],                    desc: 'Открыть в просмотре' },
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
        id: 'general',
        title: 'Общее',
        icon: 'bi-keyboard',
        items: [
            { keys: ['?'],                      desc: 'Эта шпаргалка' },
        ],
    },
];

// Which group matters most right now (it's shown first and highlighted).
export function currentHotkeyContext() {
    if (document.querySelector('.img-editor')) return 'editor';
    const modal = document.querySelector('.modal-view');
    if (modal) return modal.querySelector('video') ? 'video' : 'viewer';
    return 'gallery';
}
