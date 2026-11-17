import Settings from "@data/settings";
import {SORT_ORDER, SORT_TYPE, SOURCE_TYPES} from "@/Constants";

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

    if (sourceType === SOURCE_TYPES.FAVORITE) {
        return [...array].sort((a, b) => (a.id - b.id) * order);
    }

    // Booru results keep the API order (Folders sorts inside FolderView).
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
    currentSource: SOURCE_TYPES.LIBRARY,
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

// The gallery state lives in React (Main, via galleryReducer). A few modules outside
// React (the booru controllers) put results into it and read the current source:
// Main binds its dispatch and a getter of the *current* state here once it mounts.
// (The getter reads a ref Main updates on every render — functions captured once
// would keep answering with the first state.)
const gallery = {
    dispatch: null,
    getState: () => initialState,
};

export function bindGallery({ dispatch, getState }) {
    gallery.dispatch = dispatch;
    gallery.getState = getState;
}

export const setGallery = (items) => gallery.dispatch?.({ type: 'SET_MAIN_ARRAY', payload: items });
export const addToGallery = (items) => gallery.dispatch?.({ type: 'ADD_TO_GALLERY', payload: items });
export const getCurrentSource = () => gallery.getState().currentSource;
export const openModal = (file) => gallery.dispatch?.({ type: 'SET_MODAL_FILE', payload: file?.uniqueId || null });