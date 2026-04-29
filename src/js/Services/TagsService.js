import {tagsApi} from "../Infrastructure/Ipc";

export const TagsService = {
    getByNames(names) { return tagsApi.getByNames(names) },
    saveTags(tags) { return tagsApi.setTags(tags) },
}

export default TagsService;