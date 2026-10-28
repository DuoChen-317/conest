import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";

export async function privateText(path: string) {
  if (!isAbsolute(path))
    throw new Error("Use an absolute local configuration path");
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = await file.stat();
    if (
      !info.isFile() ||
      info.nlink !== 1 ||
      info.size > 64000 ||
      (info.mode & 0o077) !== 0 ||
      (process.getuid && info.uid !== process.getuid())
    )
      throw new Error(
        "Local configuration and token files must be owner-only (chmod 600)",
      );
    return await file.readFile("utf8");
  } finally {
    await file.close();
  }
}

export async function localToken(environment: NodeJS.ProcessEnv) {
  const token = environment.CONEST_TOKEN_FILE
    ? (await privateText(environment.CONEST_TOKEN_FILE)).trim()
    : environment.CONEST_TOKEN;
  if (!token || !/^cn_[A-Za-z0-9_-]+$/.test(token))
    throw new Error(
      "Set CONEST_TOKEN_FILE to an owner-only AI credential file, or set CONEST_TOKEN",
    );
  return token;
}
