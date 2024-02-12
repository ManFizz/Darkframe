import {getImageList} from "./thumb";

let typeOrder = 'asc'; // 'asc' или 'desc'
export function getTypeOrder() {
    return typeOrder;
}

export function ToggleOrderSort() {
    if (typeOrder !== 'asc') {
        typeOrder = 'asc';
    } else typeOrder = 'desc';

    let icon = document.querySelector('#btn-order-sort .fa');
    if (icon) {
        icon.className = 'fa fa-sort-' + typeOrder;
        icon.outerHTML += "";
    }

    SortFolderDisplay();
}

let typeSort = 'time'; // 'name' или 'time'
export function getTypeSort() {
    return typeSort;
}

//let sortTypes = ['name', 'type']; TODO

export function ToggleTypeSort() {
    if(typeSort === 'name'){
        typeSort = 'time'
    } else typeSort = 'name';

    document.querySelector("#btn-type-sort").innerText = typeSort;

    SortFolderDisplay();
}

export function sortFolderArray(arr) {
    const sortFunctionArray = (a, b) => {
        if (typeSort === 'name') {
            return typeOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        } else if (typeSort === 'time') {
            return typeOrder === 'asc' ? a.time - b.time : b.time - a.time;
        }
    };

    return arr.sort(sortFunctionArray);
}


let imageList;
function SortFolderDisplay() {
    imageList = getImageList();
    const gallery = document.getElementById('gallery');
    const thumbs = gallery.querySelectorAll('.thumb');

    const sortedThumbs = sortFolderThumbs(Array.from(thumbs));
    sortedThumbs.forEach(thumb => {
        gallery.insertBefore(thumb, null);
    });
}

function sortFolderThumbs(arr) {
    const sortFunctionThumbs = (a, b) => {
        const idListA = parseInt(a.getAttribute("id-list"));
        const idListB = parseInt(b.getAttribute("id-list"));
        const IsValidDisplayId = (id) => {
            if(isNaN(id))
                return false;

            let object = imageList[id];
            return object !== null && object !== undefined;
        };
        const getValue = (object) => {
            if(object === undefined)
                throw "wtf" + object + " | " + typeof object;

            if(typeSort === 'time')
                return object.time;

            if(typeSort === 'name')
                return object.title || object.thumbUrl;

            throw "undef typeSort: [" + typeOrder + "]";
        };

        const validA = IsValidDisplayId(idListA);
        const validB = IsValidDisplayId(idListB);

        if (validA && validB) {
            const valueA = getValue(imageList[idListA]),
                valueB  = getValue(imageList[idListB]);

            if (typeOrder === 'name') {
                return valueA.localeCompare(valueB);
            } else {
                return valueA - valueB;
            }
        } else if (validA && !validB) {
            return -1;
        } else if (!validA && validB) {
            return 1;
        } else {
            return 0;
        }
    }

    return arr.sort(sortFunctionThumbs);
}