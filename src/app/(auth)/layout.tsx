import { PaperboyLogo } from "@/components/brand/paperboy-logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <div className="auth-page">
        <PaperboyLogo compact />
        {children}
      </div>
    </main>
  );
}
