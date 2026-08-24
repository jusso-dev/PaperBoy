export function PostalStamp() {
  return (
    <svg
      aria-hidden="true"
      className="postal-stamp-illustration"
      fill="none"
      viewBox="0 0 310 120"
    >
      <g stroke="currentColor" strokeLinecap="round">
        <path d="M7 29c38-12 70 13 111 0 27-9 52-8 72 0" opacity=".5" />
        <path d="M7 43c38-12 70 13 111 0 27-9 52-8 72 0" opacity=".62" />
        <path d="M7 57c38-12 70 13 111 0 27-9 52-8 72 0" opacity=".48" />
        <path d="M7 71c38-12 70 13 111 0 27-9 52-8 72 0" opacity=".58" />
      </g>
      <path
        d="m245 5 6 7 9-3 3 9 9 1-1 10 8 5-5 8 6 8-7 6 3 9-9 3-1 9-10 1-5 8-8-5-8 6-6-7-9 3-3-9-9-1 1-10-8-5 5-8-6-8 7-6-3-9 9-3 1-9 10-1 5-8 8 5Z"
        fill="var(--paper-light)"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <circle cx="244" cy="49" r="32" stroke="currentColor" strokeWidth="2" />
      <circle cx="244" cy="49" r="25" stroke="currentColor" strokeDasharray="2 3" />
      <path d="m228 43 16 12 16-12v19h-32V43Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="m228 43 16 12 16-12" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path id="stamp-top" d="M218 47a26 26 0 0 1 52 0" />
      <text className="postal-stamp-text" textAnchor="middle">
        <textPath href="#stamp-top" startOffset="50%">PAPERBOY</textPath>
      </text>
      <text className="postal-stamp-delivered" x="244" y="81" textAnchor="middle">DELIVERED</text>
    </svg>
  );
}
