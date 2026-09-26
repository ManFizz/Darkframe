import {useEffect, useState} from "react";
import {FavoriteTagsService} from "@services/FavoriteTagsService";

export function useFavoriteTags() {
    const [favoriteTags, setFavoriteTags] = useState(FavoriteTagsService.getAll());

    useEffect(() => FavoriteTagsService.subscribe(setFavoriteTags), []);

    return {
        favoriteTags,
        addFavTag:    (tag, remoteType) => FavoriteTagsService.add(tag, remoteType),
        removeFavTag: (tag, remoteType) => FavoriteTagsService.remove(tag, remoteType),
        isFavTag:     (tag, remoteType) => FavoriteTagsService.has(tag, remoteType),
    };
}

export default useFavoriteTags;
