// Shift + Delete (key or button): past the trash, gone for good — asked first,
// since neither the trash nor Ctrl+Z can bring it back.
export function confirmDeleteForever(count = 1, title = '') {
    const what = count > 1 ? `${count} файлов` : title ? `«${title}»` : 'этот файл';
    return window.confirm(`Удалить ${what} навсегда, минуя корзину?\nВосстановить будет нельзя.`);
}
