import fs from "fs";

export const createFileOrFolder = async (
  pathName: string,
  isFolder: boolean,
): Promise<boolean> => {
  try {
    if (fs.existsSync(pathName)) {
      return false;
    }
    if (isFolder) {
      await fs.promises.mkdir(pathName);
    } else {
      await fs.promises.writeFile(pathName, "");
    }
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};

export const renameFileOrFolder = async (
  oldPath: string,
  newPath: string,
): Promise<boolean> => {
  try {
    if (!fs.existsSync(oldPath)) {
      return false;
    }
    if (fs.existsSync(newPath)) {
      return false;
    }
    await fs.promises.rename(oldPath, newPath);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};

export const deleteFileOrFolder = async (
  pathName: string,
): Promise<boolean> => {
  try {
    if (!fs.existsSync(pathName)) {
      return false;
    }
    await fs.promises.rm(pathName, { recursive: true });
    return true;
  } catch (error) {
    return false;
  }
};

export const moveFileOrFolder = async (
  oldPath: string,
  newPath: string,
): Promise<boolean> => {
  try {
    await fs.promises.rename(oldPath, newPath);
    return true;
  } catch (error) {
    return false;
  }
};

export const copyFileOrFolder = async (
  oldPath: string,
  newPath: string,
): Promise<boolean> => {
  try {
    await fs.promises.copyFile(oldPath, newPath);
    return true;
  } catch (error) {
    return false;
  }
};

export const getFile = async (path: string): Promise<string> => {
  try {
    if (!fs.existsSync(path)) {
      return "";
    }
    const data = await fs.promises.readFile(path, "utf8");
    return data;
  } catch (error) {
    return "";
  }
};

export const saveFile = async (
  path: string,
  content: string,
): Promise<boolean> => {
  try {
    if (!fs.existsSync(path)) {
      return false;
    }
    await fs.promises.writeFile(path, content);
    return true;
  } catch (error) {
    return false;
  }
};

export const getLanguage = (filename: string): string => {
  const ext = filename.split(".").pop()?.toLowerCase();
  const languageMap: { [key: string]: string } = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    java: "java",
    cpp: "cpp",
    c: "c",
    cc: "cpp",
    cxx: "cpp",
    cs: "csharp",
    php: "php",
    rb: "ruby",
    go: "go",
    rs: "rust",
    swift: "swift",
    kt: "kotlin",
    html: "html",
    css: "css",
    scss: "scss",
    json: "json",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    sql: "sql",
    sh: "shell",
    bash: "shell",
  };
  return languageMap[ext || ""] || "plaintext";
};
