// 특정 순간에 어떤 사용자가 어떤 보드의 실시간 스트림(SSE)에 연결되어 있는지 추적하는
// 메모리 레지스트리입니다. "지금 그 보드를 보고 있는 사용자"에게는 같은 소식을 개인 알림으로
// 중복 발송하지 않기 위해 씁니다. 단일 인스턴스 전제이며, 여러 인스턴스로 확장할 때는
// 공유 저장소(Redis 등)로 옮겨야 합니다.
const globalForViewers = globalThis as unknown as { pyxpadBoardViewers?: Map<string, Set<string>> };

function registry() {
  if (!globalForViewers.pyxpadBoardViewers) globalForViewers.pyxpadBoardViewers = new Map();
  return globalForViewers.pyxpadBoardViewers;
}

export function markViewing(boardId: string, userId: string) {
  const map = registry();
  const set = map.get(boardId) ?? new Set<string>();
  set.add(userId);
  map.set(boardId, set);
  return () => {
    const current = map.get(boardId);
    if (!current) return;
    current.delete(userId);
    if (current.size === 0) map.delete(boardId);
  };
}

export function isViewingBoard(boardId: string, userId: string) {
  return registry().get(boardId)?.has(userId) ?? false;
}
