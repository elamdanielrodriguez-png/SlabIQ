export default function Logo({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Card body */}
      <rect x="3" y="2" width="24" height="32" rx="3.5"
        fill="rgba(201,168,76,0.07)" stroke="#c9a84c" strokeWidth="1.9" />

      {/* Photo area */}
      <rect x="6.5" y="5.5" width="17" height="11" rx="2"
        fill="#c9a84c" opacity="0.16" />

      {/* Horizontal rule lines (card text area) */}
      <rect x="6.5" y="20.5" width="17" height="1.6" rx="0.8" fill="#c9a84c" opacity="0.28" />
      <rect x="6.5" y="24"   width="12" height="1.6" rx="0.8" fill="#c9a84c" opacity="0.18" />

      {/* Grade badge circle — overlaps bottom-right corner of card */}
      <circle cx="30" cy="30" r="9.5" fill="#0d0d0d" stroke="#c9a84c" strokeWidth="2" />

      {/* "10" inside badge — path-drawn so no font dependency */}
      {/* "1" */}
      <line x1="26.8" y1="26.2" x2="26.8" y2="33.8" stroke="#c9a84c" strokeWidth="1.9" strokeLinecap="round" />
      <line x1="25.1" y1="27.9" x2="26.8" y2="26.2" stroke="#c9a84c" strokeWidth="1.9" strokeLinecap="round" />
      {/* "0" */}
      <rect x="28.8" y="26.2" width="4.4" height="7.6" rx="2.2"
        fill="none" stroke="#c9a84c" strokeWidth="1.9" />
    </svg>
  );
}
