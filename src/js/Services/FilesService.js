import {filesApi} from "@/Infrastructure/Ipc";

export const FileService = {
    getFilesByPath(path) { return filesApi.getFilesByPath(path) },
}

export default FileService;