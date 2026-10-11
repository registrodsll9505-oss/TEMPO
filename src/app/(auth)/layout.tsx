import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center bg-sidebar px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Logo size={30} />
          <p className="text-ink-2">El tiempo, mejor organizado.</p>
        </div>
        <div className="rounded-2xl bg-raised p-6 shadow-pop">{children}</div>
      </div>
    </main>
  );
}
