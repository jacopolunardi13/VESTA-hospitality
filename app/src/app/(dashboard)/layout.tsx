import BottomNav from "@/components/layout/bottom-nav";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Topbar />
      <div className="flex">
        <Sidebar />
        <main className="min-w-0 flex-1 p-4 pb-24 md:p-6 md:pb-6">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
