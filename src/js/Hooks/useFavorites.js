import {useEffect, useState} from "react";
import FavoritesService from "@services/FavoritesService"

export function useFavorites() {

    const [favorites, setFavorites] = useState(FavoritesService.getAll());

    useEffect(() => {
        // Always hand React a fresh array reference: favourite/pending state can
        // change without the list itself changing, and we still need a re-render.
        return FavoritesService.subscribe((favs) => setFavorites([...favs]));
    }, []);

    return {
        favorites,
        addFav: FavoritesService.add.bind(FavoritesService),
        removeFav: FavoritesService.remove.bind(FavoritesService),
        isFav: FavoritesService.isFav.bind(FavoritesService),
        isPending: FavoritesService.isPending.bind(FavoritesService),
        toggleFav: FavoritesService.toggleFav.bind(FavoritesService),
    };
}

export default useFavorites;