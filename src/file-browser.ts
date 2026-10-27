export type ProjectFile = {
  id: string;
  path: string;
  visibility: string;
  version: number;
  size: number;
  updated_at: string;
};
export type FileDirectory = {
  name: string;
  path: string;
  folders: FileDirectory[];
  files: ProjectFile[];
  fileCount: number;
};

export function buildFileIndex(files: ProjectFile[], locale = "en") {
  const directories = new Map<string, FileDirectory>();
  const root: FileDirectory = {
    name: "",
    path: "",
    folders: [],
    files: [],
    fileCount: 0,
  };
  directories.set("", root);
  for (const file of files) {
    const segments = file.path.split("/");
    let directory = root;
    directory.fileCount++;
    for (const name of segments.slice(0, -1)) {
      const path = pathInDirectory(directory.path, name);
      let child = directories.get(path);
      if (!child) {
        child = { name, path, folders: [], files: [], fileCount: 0 };
        directories.set(path, child);
        directory.folders.push(child);
      }
      directory = child;
      directory.fileCount++;
    }
    directory.files.push(file);
  }
  const compare = new Intl.Collator(locale, {
    numeric: true,
    sensitivity: "base",
  }).compare;
  for (const directory of directories.values()) {
    directory.folders.sort(
      (a, b) => compare(a.name, b.name) || a.path.localeCompare(b.path),
    );
    directory.files.sort(
      (a, b) =>
        compare(fileName(a.path), fileName(b.path)) ||
        a.path.localeCompare(b.path),
    );
  }
  return directories;
}

export const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
export const parentDirectory = (path: string) =>
  path.slice(0, Math.max(0, path.lastIndexOf("/")));
export const pathInDirectory = (directory: string, name: string) =>
  directory ? `${directory}/${name}` : name;

export function resolveDirectory(
  index: Map<string, FileDirectory>,
  path: string,
): FileDirectory {
  while (!index.has(path)) path = parentDirectory(path);
  return index.get(path)!;
}

export function searchDirectory(
  files: ProjectFile[],
  directory: string,
  query: string,
) {
  const prefix = directory ? directory + "/" : "";
  const term = query.trim().normalize("NFC").toLocaleLowerCase();
  return files.filter(
    (file) =>
      file.path.startsWith(prefix) &&
      file.path
        .slice(prefix.length)
        .normalize("NFC")
        .toLocaleLowerCase()
        .includes(term),
  );
}
