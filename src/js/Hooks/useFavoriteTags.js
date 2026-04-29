import {useEffect, useState} from "react";
import {FavoriteTagsService} from "../Services/FavoriteTagsService";

export function useFavoriteTags() {

    const [favoriteTags, setFavoriteTags] = useState(FavoriteTagsService.getAll());

    useEffect(() => {
        return FavoriteTagsService.subscribe(setFavoriteTags);
    }, []);

    return {
        favoriteTags,
        addFavTag: FavoriteTagsService.add.bind(FavoriteTagsService),
    };
}

export default useFavoriteTags;