import {useEffect, useState} from "react";
import FavoritesService from "./../Services/FavoritesService"

export function useFavorites() {

    const [favorites, setFavorites] = useState(FavoritesService.getAll());

    useEffect(() => {
        return FavoritesService.subscribe(setFavorites);
    }, []);

    return {
        favorites,
        addFav: FavoritesService.add.bind(FavoritesService),
        removeFav: FavoritesService.remove.bind(FavoritesService),
        isFav: FavoritesService.isFav.bind(FavoritesService),
        toggleFav: FavoritesService.toggleFav.bind(FavoritesService),
    };
}

export default useFavorites;