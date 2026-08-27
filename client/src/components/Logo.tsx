export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-label="Mossback"
      role="img"
    >
      <circle cx="24" cy="29" r="14" fill="#8FE0C0" />
      <path
        d="M24 15c-4.5 1.1-7.5 3.6-8.6 7.4l3.2 2.2 3.4-3.6 2 3.9 2-3.9 3.4 3.6 3.2-2.2C31.5 18.6 28.5 16.1 24 15Z"
        fill="#FFF9E7"
        stroke="#EADFC0"
        strokeWidth="0.6"
      />
      <ellipse cx="18.4" cy="29.6" rx="3.5" ry="4.3" fill="#fff" />
      <ellipse cx="29.6" cy="29.6" rx="3.5" ry="4.3" fill="#fff" />
      <circle cx="19" cy="30.6" r="1.9" fill="#22303B" />
      <circle cx="30.2" cy="30.6" r="1.9" fill="#22303B" />
      <circle cx="17.9" cy="28.3" r="0.7" fill="#fff" />
      <circle cx="29.1" cy="28.3" r="0.7" fill="#fff" />
      <circle cx="13.4" cy="32.6" r="2.6" fill="#FF9AA2" opacity="0.85" />
      <circle cx="34.6" cy="32.6" r="2.6" fill="#FF9AA2" opacity="0.85" />
      <path
        d="M21 34.6c1 1.4 5 1.4 6 0"
        stroke="#22303B"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
