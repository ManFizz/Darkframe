import {getImageList} from "./thumb";
import {currentSection} from "./main";

let typeOrder = 'asc'; // 'asc' или 'desc'

export function ToggleOrderSort() {
    document.querySelector("#btn-order-sort").classList.toggle('flip');
    typeOrder = typeOrder === 'asc' ? 'desc' : 'asc';

    SortFolderDisplay();
}

let typeSort = 'time'; // 'name' или 'time'

export function SetTypeSort(type) {
    if(type in ['name', 'time'])
        throw new Error("undef type sort");

    typeSort = type;

    if(currentSection === "section-folders")
    SortFolderDisplay();
}

const sortFunctionArray = (a, b) => {
    if (typeSort === 'name') {
        return typeOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    } else if (typeSort === 'time') {
        return typeOrder === 'asc' ? a.time - b.time : b.time - a.time;
    }
};

export function sortFolderArray(arr) {
    return arr.sort(sortFunctionArray);
}

let imageList;
function SortFolderDisplay() {
    imageList = getImageList();
    const gallery = document.getElementById('gallery');
    const thumbs = gallery.childNodes;
    let itemsArr = [];
    for (let i in thumbs) {
        if (thumbs[i].nodeType === 1) {
            itemsArr.push(thumbs[i]);
        }
    }

    itemsArr = sortFolderThumbs(itemsArr);
    for (let i = 0; i < itemsArr.length; ++i) {
        gallery.appendChild(itemsArr[i]);
    }
}

function sortFolderThumbs(arr) {
    const getValue = (o) => {
        if (o === undefined)
            throw new Error("Invalid object: " + o);

        return typeSort === 'time' ? o.time : (o.title || o.thumbUrl);
    };

    const sortFunctionThumbs = (a, b) => {
        const idListA = parseInt(a.getAttribute("id-list"));
        const idListB = parseInt(b.getAttribute("id-list"));

        const IsValidDisplayId = (id) => !isNaN(id) && imageList[id] !== null && imageList[id] !== undefined;

        const validA = IsValidDisplayId(idListA);
        const validB = IsValidDisplayId(idListB);

        if (!validA && !validB) return 0;
        if (validA && !validB) return 1;
        if (!validA && validB) return -1;

        const valueA = getValue(imageList[idListA]);
        const valueB = getValue(imageList[idListB]);
        let result = typeSort === 'name' ? valueA.localeCompare(valueB) : valueA - valueB;
        if(typeOrder !== 'asc')
            result *= -1;
        
        return result;
    };
    return arr.sort(sortFunctionThumbs);
}
