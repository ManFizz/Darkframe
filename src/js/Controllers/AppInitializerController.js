import Settings from "../../../data/settings";
import {SORT_ORDER, SORT_TYPE, SOURCE_TYPES} from "../Constants";

export const SORT_STRATEGIES = {
    [SORT_TYPE.NAME]: (a, b) =>
        (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: 'base' }),

    [SORT_TYPE.TIME]: (a, b) =>
        (a.time || 0) - (b.time || 0),

    [SORT_TYPE.PRIORITY]: (a, b) =>
        (a.priority || 0) - (b.priority || 0),

    [SORT_TYPE.ID]: (a, b) =>
        (a.priority || 0) - (b.priority || 0),
};

export function getSortedArray(array, sortInfo, sourceType) {
    if (!Array.isArray(array)) return [];

    const order = sortInfo?.order ?? SORT_ORDER.ASC;
    const strategy = SORT_STRATEGIES[sortInfo?.type];

    if (sourceType === SOURCE_TYPES.FAVORITE) {
        console.log(array);
        return [...array].sort((a, b) => (a.id - b.id) * order);
    }

    if (sourceType === SOURCE_TYPES.FOLDER) {
        return [...array].sort((a, b) => {
            if (a.priority !== b.priority) {
                return (b.priority || 0) - (a.priority || 0);
            }

            let result = strategy ? strategy(a, b) : 0;
            result *= order;

            if (result === 0) {
                const idA = String(a.uniqueId || "");
                const idB = String(b.uniqueId || "");
                return idA.localeCompare(idB);
            }

            return result;
        });
    }

    return array;
}

export function getNextViewType(currentType) {
    const minView = 1;
    const maxView = 3;
    return currentType + 1 <= maxView ? currentType + 1 : minView;
}

export const initialState = {
    mainArray: [],
    displayArray: [],
    favTagsArray: [],
    currentSource: SOURCE_TYPES.FOLDER,
    typeView: 2,
    sortInfo: { order: SORT_ORDER.DESC, type: SORT_TYPE.TIME },
    safeMode: Settings.SafeView,
    tagsVersion: 0,
    modalFileId: null,
};

export function galleryReducer(state, action) {
    const getDisplaySlice = (arr) => arr.slice(0, Settings.MaxThumbsPerPage);

    switch (action.type) {
        case 'SET_MAIN_ARRAY': {
            const sorted = getSortedArray(action.payload, state.sortInfo, state.currentSource);
            return {
                ...state,
                mainArray: sorted,
                displayArray: getDisplaySlice(sorted)
            };
        }

        case 'SET_DISPLAY_ARRAY':
            return { ...state, displayArray: action.payload };

        case 'ADD_TO_GALLERY':
            return { ...state, mainArray: [...state.mainArray, ...action.payload] };

        case 'SET_FAV_TAGS':
            return { ...state, favTagsArray: action.payload };

        case 'SET_CURRENT_SOURCE':
            return { ...state, currentSource: action.payload, mainArray: [], displayArray: [] };

        case 'SET_TYPE_VIEW':
            return { ...state, typeView: action.payload };

        case 'SET_SORT_INFO': {
            const sorted = getSortedArray(state.mainArray, action.payload, state.currentSource);
            return {
                ...state,
                sortInfo: action.payload,
                mainArray: sorted,
                displayArray: getDisplaySlice(sorted)
            };
        }

        case 'SET_MODAL_FILE':
            return { ...state, modalFileId: action.payload };

        case 'SET_SAFE_MODE':
            return { ...state, safeMode: action.payload };

        case 'INCREMENT_TAGS_VERSION':
            return { ...state, tagsVersion: state.tagsVersion + 1 };

        case 'UPDATE_FILE': {
            const update = (arr) =>
                arr.map(f => f.uniqueId === action.payload.uniqueId ? action.payload : f);

            return {
                ...state,
                mainArray: update(state.mainArray),
                displayArray: update(state.displayArray)
            };
        }

        default:
            return state;
    }
}

export const AppController = {
    setGallery: () => {},
    addToGallery: () => {},
    getGallery: () => [],
    getCurrentSource: () => {},
    setTypeView: () => {},
    updateGalleryFile: () => {},
};

export const setGallery = (...args) =>
    AppController.setGallery(...args);

export const addToGallery = (...args) =>
    AppController.addToGallery(...args);

export const getGallery = (...args) =>
    AppController.getGallery(...args);

export const getCurrentSource = (...args) =>
    AppController.getCurrentSource(...args);

export const setTypeView = (...args) =>
    AppController.setTypeView(...args);

export const updateGalleryFile = (...args) =>
    AppController.updateGalleryFile(...args);