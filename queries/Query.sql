UPDATE Favorites
SET sourceUrl = REPLACE(sourceUrl,
   'https://gelbooru.com/index.php?page=dapi&s=post&q=index&api_key=630352bf5181c86a6ed789008efa61807f04925d04f45441c718041f5a33c914&user_id=1325957&id=',
   'https://gelbooru.com/index.php?page=post&s=view&id='
   )
WHERE sourceUrl LIKE '%https://gelbooru.com/index.php?page=dapi&s=post&q=index&api_key=630352bf5181c86a6ed789008efa61807f04925d04f45441c718041f5a33c914&user_id=1325957&id=%';

UPDATE Favorites
SET thumbUrl = REPLACE(thumbUrl, 'https://gelbooru.com/index.php?page=post&s=view&id=', 'img2.gelbooru')
WHERE thumbUrl LIKE '%img4.gelbooru%';

DELETE FROM Favorites
WHERE sourceUrl IN ('https://rule34.xxx/index.php?page=post&s=view&id=10847990',
'https://rule34.xxx/index.php?page=post&s=view&id=5995441',
'https://rule34.xxx/index.php?page=post&s=view&id=10785163',
'https://rule34.xxx/index.php?page=post&s=view&id=9665809',
'https://rule34.xxx/index.php?page=post&s=view&id=9665814',
'https://rule34.xxx/index.php?page=post&s=view&id=9665815',
'https://rule34.xxx/index.php?page=post&s=view&id=9795222',
'https://rule34.xxx/index.php?page=post&s=view&id=9795160',
'https://rule34.xxx/index.php?page=post&s=view&id=9792290',
'https://rule34.xxx/index.php?page=post&s=view&id=9795428',
'https://rule34.xxx/index.php?page=post&s=view&id=9792499',
'https://rule34.xxx/index.php?page=post&s=view&id=9795300',
'https://rule34.xxx/index.php?page=post&s=view&id=9795116',
'https://rule34.xxx/index.php?page=post&s=view&id=9795070',
'https://rule34.xxx/index.php?page=post&s=view&id=9861314',
'https://rule34.xxx/index.php?page=post&s=view&id=10582607',
'https://rule34.xxx/index.php?page=post&s=view&id=9817928',
'https://rule34.xxx/index.php?page=post&s=view&id=9703213',
'https://rule34.xxx/index.php?page=post&s=view&id=9703212',
'https://rule34.xxx/index.php?page=post&s=view&id=9703209',
'https://rule34.xxx/index.php?page=post&s=view&id=9668876',
'https://rule34.xxx/index.php?page=post&s=view&id=9673643',
'https://rule34.xxx/index.php?page=post&s=view&id=9673639',
'https://rule34.xxx/index.php?page=post&s=view&id=9673646',
'https://rule34.xxx/index.php?page=post&s=view&id=9673640',
'https://rule34.xxx/index.php?page=post&s=view&id=9673637',
'https://rule34.xxx/index.php?page=post&s=view&id=9837391',
'https://rule34.xxx/index.php?page=post&s=view&id=9773767',
'https://rule34.xxx/index.php?page=post&s=view&id=9798471',
'https://rule34.xxx/index.php?page=post&s=view&id=5506937',
'https://rule34.xxx/index.php?page=post&s=view&id=9690472',
'https://rule34.xxx/index.php?page=post&s=view&id=9786545',
'https://rule34.xxx/index.php?page=post&s=view&id=10641808',
'https://rule34.xxx/index.php?page=post&s=view&id=9724118',
'https://rule34.xxx/index.php?page=post&s=view&id=10888721',
'https://rule34.xxx/index.php?page=post&s=view&id=9649656',
'https://rule34.xxx/index.php?page=post&s=view&id=8601348',
'https://rule34.xxx/index.php?page=post&s=view&id=8601410',
'https://rule34.xxx/index.php?page=post&s=view&id=8601367',
'https://rule34.xxx/index.php?page=post&s=view&id=9655180',
'https://rule34.xxx/index.php?page=post&s=view&id=9655177',
'https://rule34.xxx/index.php?page=post&s=view&id=9655176',
'https://rule34.xxx/index.php?page=post&s=view&id=9855022',
'https://rule34.xxx/index.php?page=post&s=view&id=9855012',
'https://gelbooru.com/index.php?page=post&s=view&id=9608648',
'https://gelbooru.com/index.php?page=post&s=view&id=8551977',
'https://gelbooru.com/index.php?page=post&s=view&id=9608558',
'https://gelbooru.com/index.php?page=post&s=view&id=9611167',
'https://gelbooru.com/index.php?page=post&s=view&id=9608559',
'https://gelbooru.com/index.php?page=post&s=view&id=9608553',
'https://gelbooru.com/index.php?page=post&s=view&id=9106465',
'https://gelbooru.com/index.php?page=post&s=view&id=9640724'
);

BEGIN;

ROLLBACK;

COMMIT;