import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDashboardHomeData } from "@/lib/dashboard/queries";
import { canCreateBoard as userCanCreateBoard } from "@/lib/auth/authorization";
import { SearchView } from "@/components/home/search-view";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/?login=1&callbackUrl=%2Fsearch");
  const { myBoards, dashboardFolders } = await getDashboardHomeData(user);
  return <SearchView boards={myBoards} folders={dashboardFolders} canCreateBoard={userCanCreateBoard(user)} />;
}
