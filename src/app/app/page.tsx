import Link from "next/link";

export default function Overview() {
  return (
    <section>
      <h1 className="page-title">Overview</h1>
      <p className="page-sub">Your console on the kitchen table.</p>

      <div className="card">
        <h2>Getting started</h2>
        <p>
          Add a sending domain, publish its DNS records, then mint an API key.
          Screens arrive as the board is worked.
        </p>
        <p style={{ marginTop: 12 }}>
          <Link className="btn btn-primary" href="/app/domains">
            Add a domain
          </Link>
        </p>
      </div>

      <div className="card">
        <h2>Recent messages</h2>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>To</th>
                <th>Subject</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={4}>No messages yet.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
