import { canReadEffectiveBoard, getEffectiveBoardAccess } from "@/lib/auth/authorization";
import { getCurrentUser } from "@/lib/auth/current-user";
import { subscribeBoardEvent, type BoardEvent } from "@/lib/realtime/board-events";
import { markViewing } from "@/lib/realtime/board-viewers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const encoder = new TextEncoder();
const encodeEvent = (name: string, data: unknown) => encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);

export async function GET(request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const currentUser = await getCurrentUser();
  const access = await getEffectiveBoardAccess(boardId, currentUser);
  if (!access || !canReadEffectiveBoard(currentUser, access)) return Response.json({ error: "패드 접근 권한이 없습니다." }, { status: 403 });
  let cleanup: (() => void) | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encodeEvent("ready", { boardId }));
      const unsubscribe = subscribeBoardEvent(boardId, (event: BoardEvent) => controller.enqueue(encodeEvent("board-change", event)));
      const stopViewing = currentUser ? markViewing(boardId, currentUser.id) : undefined;
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`)), 20_000);
      cleanup = () => { clearInterval(heartbeat); unsubscribe(); stopViewing?.(); try { controller.close(); } catch {} };
      request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() { cleanup?.(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
