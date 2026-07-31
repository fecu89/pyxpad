import path from "node:path";

export function getUploadRoot() {
  return process.env.UPLOAD_DIR
    ? path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR)
    : path.join(process.cwd(), "data", "uploads");
}

export function resolveStoredFile(storagePath: string) {
  const root = getUploadRoot();
  const resolved = path.resolve(/* turbopackIgnore: true */ root, storagePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("허용되지 않은 파일 경로입니다.");
  }
  return resolved;
}

export function createPostUploadDirectory(boardId: string, postId: string) {
  return path.join(/* turbopackIgnore: true */ getUploadRoot(), "boards", boardId, "posts", postId);
}

// 실제 카카오 로그인(lib/auth/auth-options.ts의 최초 가입 시 randomUUID() 사용)으로 만들어진
// 사용자 ID는 하이픈이 들어간 UUID 형식이고, 시드 계정 등은 Prisma 기본값인 cuid(하이픈 없음)
// 형식입니다. 둘 다 통과해야 하므로 하이픈도 허용하되, 경로 조작에 쓰일 수 있는 문자(/, \, .. 등)는
// 여전히 전부 막습니다.
const RESOURCE_ID_LIKE = /^[a-z0-9-]+$/i;

export function getAvatarDirectory(userId: string) {
  if (!RESOURCE_ID_LIKE.test(userId)) throw new Error("사용자 ID 형식이 올바르지 않습니다.");
  return path.join(/* turbopackIgnore: true */ getUploadRoot(), "avatars", userId);
}

export function getAvatarPath(userId: string) {
  return path.join(/* turbopackIgnore: true */ getAvatarDirectory(userId), "avatar.webp");
}

export function getBoardUploadDirectory(boardId: string) {
  if (!RESOURCE_ID_LIKE.test(boardId)) throw new Error("패드 ID 형식이 올바르지 않습니다.");
  return path.join(/* turbopackIgnore: true */ getUploadRoot(), "boards", boardId);
}

export function getBoardBackgroundPath(boardId: string) {
  return path.join(/* turbopackIgnore: true */ getBoardUploadDirectory(boardId), "background.webp");
}

export function toStoragePath(absolutePath: string) {
  const root = getUploadRoot();
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("업로드 루트 밖의 경로입니다.");
  return relative.split(path.sep).join("/");
}
