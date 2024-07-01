const fav_url = 'https://realbooru.com/index.php?page=favorites&s=view&id=71539';

async function fetchHTML(url) {
	try {
		const response = await fetch(url);
		const html = await response.text();
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		return doc.querySelectorAll('.thumb');
	} catch (error) {
		console.error('Ошибка при получении или обработке HTML:', error);
	}
}

const arr = await fetchHTML(fav_url);
console.log(arr);