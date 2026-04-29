import FavoriteTagsService from "./Services/FavoriteTagsService";
import FavoritesService from "./Services/FavoritesService";

let isInitialized = false;

export async function InitDatabaseData() {
    if (isInitialized) return;
    isInitialized = true;

    await FavoritesService.init();
    await FavoriteTagsService.init();
}