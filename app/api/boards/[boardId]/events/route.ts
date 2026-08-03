import { canReadEffectiveBoard, getEffectiveBoardAccess } from "@/lib/auth/authorization";
import { getCurrentUser } from "@/lib/auth/current-user";
import { subscribeBoardEvent, type BoardEvent } from "@/lib/realtime/board-events";
import { markViewing } from "@/lib/realtime/board-viewers";
import { createEventStream } from "@/lib/realtime/sse-stream";
import { trustedClientIdentifier } from "@/lib/security/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 한 사람이 같은 보드를 여러 탭으로 열 수는 있어야 하지만(수업 중 흔함), 스크립트가 무한정
// 붙는 건 막아야 합니다. 비로그인 방문자는 신뢰 가능한 IP가 없으면 하나의 버킷으로 묶이므로
// 공개 보드의 정상 열람이 서로를 막지 않도록 조금 더 여유를 둡니다.
const MAX_CONNECTIONS_PER_VIEWER = 6;
const MAX_CONNECTIONS_PER_ANONYMOUS_BUCKET = 60;

export async function GET(request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const currentUser = await getCurrentUser();
  const access = await getEffectiveBoardAccess(boardId, currentUser);
  if (!access || !canReadEffectiveBoard(currentUser, access)) {
    return Response.json({ error: "패드 접근 권한이 없습니다." }, { status: 403 });
  }

  return createEventStream({
    request,
    connectionKey: currentUser
      ? `board:${boardId}|u:${currentUser.id}`
      : `board:${boardId}|ip:${trustedClientIdentifier(request.headers)}`,
    maxPerKey: currentUser ? MAX_CONNECTIONS_PER_VIEWER : MAX_CONNECTIONS_PER_ANONYMOUS_BUCKET,
    subscribe(emit) {
      emit("ready", { boardId });
      const unsubscribe = subscribeBoardEvent(boardId, (event: BoardEvent) => emit("board-change", event));
      const stopViewing = currentUser ? markViewing(boardId, currentUser.id) : undefined;
      return () => {
        unsubscribe();
        stopViewing?.();
      };
    },
  });
}
