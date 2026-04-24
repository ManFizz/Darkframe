import {useCallback} from "react";
import {setGallery} from "../AppInitializer";

import {GetFiles} from "../backend";
import {GetThumbByData} from "./GalleryController";
import {FILE_TYPES, SOURCE_TYPES} from "../Constants";

export function useDisplayImagesByPath() {

    return useCallback(async (path) => {
        const responseText = await GetFiles(path);

        if (!responseText) {
            console.error("Path not found:", path);
            setGallery([]);
            return;
        }

        const arr = JSON.parse(responseText);

        const skippedNames = ['.nomedia', '_gsdata_'];
        let array = [];

        arr.forEach(item => {
            const {name, time, isDir} = item;

            if (skippedNames.includes(name))
                return;

            let thumbFile;
            if (isDir) {
                thumbFile = GetThumbByData({
                    type: FILE_TYPES.FOLDER,
                    title: name,
                    sourceUrl: path,
                    thumbUrl: name,
                    priority: 1000000,
                });
            } else {
                thumbFile = GetThumbByData({
                    thumbUrl: path + "\\" + name,
                    remoteType: SOURCE_TYPES.FOLDER,
                    title: name,
                    time: time,
                    remoteId: name,
                });
            }

            if (thumbFile)
                array.push(thumbFile);
        });

        const pathParts = path.split('\\');
        if (pathParts.length > 1) {
            const newPath = pathParts.slice(0, -1).join('\\');
            const name = pathParts[pathParts.length - 2];

            const backItem = GetThumbByData({
                type: FILE_TYPES.RETURN,
                title: name,
                sourceUrl: newPath,
                thumbUrl: name,
                priority: 100000000,
            });

            if (backItem) array.push(backItem);
        }
        console.log(array);
        setGallery(array);

    }, [setGallery]);
}