import FavoriteTagsService from "@services/FavoriteTagsService";
import FavoritesService from "@services/FavoritesService";

let isInitialized = false;

export async function InitDatabaseData() {
    if (isInitialized) return;
    isInitialized = true;

    await FavoritesService.init();
    await FavoriteTagsService.init();
}