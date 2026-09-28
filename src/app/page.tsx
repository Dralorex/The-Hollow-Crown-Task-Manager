import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect("/app");

  return (
    <main className="rowgon-wave-bg relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[42vh] opacity-40"
        style={{
          background:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 320' preserveAspectRatio='none'%3E%3Cpath fill='%231a7a82' fill-opacity='0.35' d='M0,192L48,176C96,160,192,128,288,133.3C384,139,480,181,576,186.7C672,192,768,160,864,144C960,128,1056,128,1152,149.3C1248,171,1344,213,1392,234.7L1440,256L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z'%3E%3C/path%3E%3Cpath fill='%233dbeab' fill-opacity='0.45' d='M0,256L60,240C120,224,240,192,360,181.3C480,171,600,181,720,192C840,203,960,213,1080,208C1200,203,1320,181,1380,170.7L1440,160L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z'%3E%3C/path%3E%3C/svg%3E\") bottom center / 100% 100% no-repeat",
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-6 pb-16 pt-8">
        <nav className="flex items-center justify-between animate-rowgon-rise">
          <span className="font-[family-name:var(--font-display)] text-2xl tracking-tight text-[#0A3D45]">
            Rowgon
          </span>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-semibold text-[#0A3D45]/80 hover:text-[#0A3D45]">
              Sign in
            </Link>
            <Link href="/signup" className="rowgon-btn-primary text-sm">
              Get started
            </Link>
          </div>
        </nav>

        <section className="flex flex-1 flex-col justify-center gap-8 py-16 md:max-w-2xl">
          <p className="animate-rowgon-swell font-[family-name:var(--font-display)] text-6xl leading-[0.95] tracking-tight text-[#0A3D45] sm:text-7xl md:text-8xl">
            Rowgon
          </p>
          <h1 className="animate-rowgon-rise-delay max-w-xl font-[family-name:var(--font-display)] text-2xl font-medium leading-snug text-[#0A3D45]/90 sm:text-3xl">
            Task management that rises with the deadline.
          </h1>
          <p className="animate-rowgon-rise-delay-2 max-w-lg text-lg text-[#0A3D45]/75">
            Nest folders, claim work, and let urgency pull the next due task to the top —
            with friends, reviews, and chats that stay in the right circle.
          </p>
          <div className="animate-rowgon-rise-delay-2 flex flex-wrap gap-3">
            <Link href="/signup" className="rowgon-btn-primary">
              Start floating
            </Link>
            <Link href="/login" className="rowgon-btn-secondary">
              I already have an account
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
