import { requireActiveUser } from "@/lib/auth/authorization";
import { subscribeUserEvent, type UserEvent } from "@/lib/realtime/user-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const encoder = new TextEncoder();
const encodeEvent = (name: string, data: unknown) => encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);

export async function GET(request: Request) {
  let user;
  try {
    user = await requireActiveUser();
  } catch {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  let cleanup: (() => void) | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encodeEvent("ready", { userId: user.id }));
      const unsubscribe = subscribeUserEvent(user.id, (event: UserEvent) => controller.enqueue(encodeEvent("notification", event)));
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`)), 20_000);
      cleanup = () => { clearInterval(heartbeat); unsubscribe(); try { controller.close(); } catch {} };
      request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() { cleanup?.(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
