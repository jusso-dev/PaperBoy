import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <div className="auth-page">
        <Link className="masthead" href="/">
          PaperBoy
        </Link>
        {children}
      </div>
    </main>
  );
}
