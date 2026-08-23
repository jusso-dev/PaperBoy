import Link from "next/link";

export default function Home() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "64px 24px" }}>
      <header>
        <p className="masthead">PaperBoy</p>
      </header>
      <section className="card" style={{ marginTop: 32 }}>
        <h1 style={{ fontSize: 30, marginBottom: 10 }}>
          Self-hosted transactional email.
        </h1>
        <p>
          A cheaper Resend you run on your own box. You run the MTA. PaperBoy
          does the rest: API keys, domains, templates, events, webhooks.
        </p>
        <p style={{ marginTop: 18 }}>
          <Link className="btn btn-primary" href="/app">Open the console</Link>
        </p>
      </section>
    </main>
  );
}
