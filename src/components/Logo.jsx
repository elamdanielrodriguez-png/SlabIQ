export default function Logo({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cgLogoCard" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#c9a84c" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#c9a84c" stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id="cgLogoBadge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#dfc055" />
          <stop offset="100%" stopColor="#b89040" />
        </linearGradient>
      </defs>

      {/* Card body */}
      <rect x="3" y="1.5" width="23" height="31" rx="3.5"
        fill="url(#cgLogoCard)" stroke="#c9a84c" strokeWidth="2" />

      {/* Photo area */}
      <rect x="6" y="5" width="17" height="11.5" rx="2"
        fill="#c9a84c" opacity="0.12" />

      {/* Player head */}
      <circle cx="14.5" cy="8.5" r="2.8" fill="#c9a84c" opacity="0.55" />

      {/* Player shoulders arc */}
      <path d="M9 16.5 Q14.5 13 20 16.5"
        stroke="#c9a84c" strokeWidth="1.6" strokeLinecap="round" opacity="0.38" fill="none" />

      {/* Name bar */}
      <rect x="6" y="21.5" width="17" height="2" rx="1" fill="#c9a84c" opacity="0.38" />

      {/* Detail lines */}
      <rect x="6"   y="25.5" width="11" height="1.5" rx="0.75" fill="#c9a84c" opacity="0.2" />
      <rect x="6"   y="28.5" width="7.5" height="1.5" rx="0.75" fill="#c9a84c" opacity="0.14" />

      {/* Badge — solid dark backing so it clips the card cleanly */}
      <circle cx="30" cy="30" r="11.5" fill="#080808" />

      {/* Badge — gold gradient fill ring */}
      <circle cx="30" cy="30" r="10.5" fill="url(#cgLogoBadge)" />

      {/* Badge — dark inner circle (doughnut effect) */}
      <circle cx="30" cy="30" r="8.2" fill="#0e0e0e" />

      {/* "1" */}
      <line x1="26.6" y1="26" x2="26.6" y2="34" stroke="#c9a84c" strokeWidth="2.3" strokeLinecap="round" />
      <line x1="25"   y1="27.6" x2="26.6" y2="26" stroke="#c9a84c" strokeWidth="2.3" strokeLinecap="round" />

      {/* "0" — oval using rounded rect */}
      <rect x="28.6" y="26" width="4.8" height="8" rx="2.4"
        fill="none" stroke="#c9a84c" strokeWidth="2.3" />
    </svg>
  );
}
