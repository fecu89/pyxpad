import { Logo } from "@/components/ui/logo";

export default function AdminLoading() {
  return <main className="loading-screen"><Logo size={29} className="pulse" /><p>최신 권한과 감사 로그를 확인하는 중입니다…</p></main>;
}
