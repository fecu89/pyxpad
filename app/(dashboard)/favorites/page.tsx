import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDashboardHomeData } from "@/lib/dashboard/queries";
import { canCreateBoard as userCanCreateBoard } from "@/lib/auth/authorization";
import { FavoritesView } from "@/components/home/favorites-view";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/?login=1&callbackUrl=%2Ffavorites");
  const { myBoards, dashboardFolders } = await getDashboardHomeData(user);
  return <FavoritesView boards={myBoards} folders={dashboardFolders} canCreateBoard={userCanCreateBoard(user)} />;
}
