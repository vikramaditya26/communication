import { Nav } from "@/components/Nav";

export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grain relative min-h-dvh">
      <Nav />
      <main className="relative z-[1] pb-24 md:pb-12">{children}</main>
    </div>
  );
}
