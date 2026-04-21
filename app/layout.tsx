import "./globals.css";
import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";

export const metadata = {
  title: "eink CMS",
  description: "Content manager for eink signage",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const authed = cookies().get(SESSION_COOKIE)?.value ? true : false;
  return (
    <html lang="en">
      <body>
        <header className="border-b border-neutral-800 bg-neutral-900">
          <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
            <Link href="/" className="font-mono text-emerald-400">eink_cms</Link>
            {authed && (
              <nav className="flex items-center gap-4 text-sm">
                <Link href="/" className="hover:text-emerald-400">Devices</Link>
                <Link href="/assets" className="hover:text-emerald-400">Assets</Link>
                <Link href="/devices/new" className="hover:text-emerald-400">+ New device</Link>
                <form action="/api/auth/logout" method="post">
                  <button className="text-neutral-400 hover:text-red-400">Log out</button>
                </form>
              </nav>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
