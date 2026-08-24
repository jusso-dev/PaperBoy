import { Tape } from "@/components/paper/tape";

export function WelcomeNote({ organizationName }: { organizationName: string }) {
  return (
    <section className="welcome-note" aria-labelledby="welcome-note-title">
      <Tape className="welcome-note-tape" />
      <div>
        <h2 id="welcome-note-title">Welcome back, {organizationName}.</h2>
        <p>Here&apos;s what&apos;s happening with your emails.</p>
      </div>
      <svg aria-hidden="true" className="welcome-plane" fill="none" viewBox="0 0 140 82">
        <path d="m13 26 110-18-39 61-18-28-30 17 6-26-29-6Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <path d="m42 32 81-24-57 33M66 41l18 28" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        <path d="M5 73c21-5 25-17 17-25" stroke="currentColor" strokeDasharray="4 7" strokeLinecap="round" strokeWidth="1.4" />
      </svg>
    </section>
  );
}
