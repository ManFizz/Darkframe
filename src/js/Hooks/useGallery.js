import {useEffect, useState} from "react";
import FavoritesService from "./../Services/FavoritesService"

export function useGallery() {
    const [mainArray, setMainArray] = useState([]);
    const [displayArray, setDisplayArray] = useState([]);

    useEffect(() => {
        return FavoritesService.subscribe((_, changedFile) => {
            if (!changedFile) return;

            const update = arr => arr.map(f =>
                f.uniqueId === changedFile.uniqueId ? changedFile : f
            );

            setMainArray(prev => update(prev));
            setDisplayArray(prev => update(prev));
        });
    }, []);

    return { mainArray, displayArray, setMainArray, setDisplayArray };
}

export default useGallery();