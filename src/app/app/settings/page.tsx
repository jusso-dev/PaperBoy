import { updateTimeZoneAction } from "./actions";
import { requireSession } from "@/lib/session";

type SettingsPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

const timeZones = ["UTC", ...Intl.supportedValuesOf("timeZone")].filter(
  (timeZone, index, values) => values.indexOf(timeZone) === index,
);

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const [session, status] = await Promise.all([
    requireSession(),
    searchParams,
  ]);

  return (
    <section>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Make the console read like your local clock.</p>

      <div className="card settings-card">
        <h2>Timezone</h2>
        <p>
          Console dates, logs, and scheduled work use this IANA timezone.
          Protocol timestamps and stored instants remain UTC.
        </p>

        {status.saved === "timezone" ? (
          <p className="form-success" role="status">
            Timezone saved.
          </p>
        ) : null}
        {status.error === "invalid-timezone" ? (
          <p className="form-error" role="alert">
            Choose a valid IANA timezone.
          </p>
        ) : null}

        <form action={updateTimeZoneAction} className="settings-form">
          <div className="field">
            <label htmlFor="timezone">IANA timezone</label>
            <select
              defaultValue={session.user.timezone}
              id="timezone"
              name="timezone"
              required
            >
              {timeZones.map((timeZone) => (
                <option key={timeZone} value={timeZone}>
                  {timeZone}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" type="submit">
            Save timezone
          </button>
        </form>
      </div>
    </section>
  );
}
