import Link from "next/link";

export default function Home() {
  return (
    <main>
      <header>
        <p>PaperBoy</p>
      </header>
      <section>
        <h1>Self-hosted transactional email.</h1>
        <p>A cheaper Resend you run on your own box. You run the MTA. PaperBoy does the rest: API keys, domains, templates, events, webhooks.</p>
        <Link href="/app">Open the console</Link>
      </section>
    </main>
  );
}
