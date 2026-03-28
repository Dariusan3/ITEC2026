function SvgIcon({ children, className = "h-4 w-4", stroke = "currentColor", fill = "none", strokeWidth = 1.9, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function PlayIcon(props) {
  return (
    <SvgIcon fill="currentColor" stroke="none" {...props}>
      <path d="M8 6.5v11l9-5.5z" />
    </SvgIcon>
  );
}

export function ShareIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M15 8l4-4" />
      <path d="M11 5h8v8" />
      <path d="M19 13v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" />
    </SvgIcon>
  );
}

export function EyeIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.75" />
    </SvgIcon>
  );
}

export function ForkIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="7" cy="5" r="2" />
      <circle cx="17" cy="19" r="2" />
      <circle cx="17" cy="5" r="2" />
      <path d="M9 5h6" />
      <path d="M7 7v6c0 1.2.8 2 2 2h6" />
      <path d="M17 7v10" />
    </SvgIcon>
  );
}

export function ArchiveIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M4 7h16" />
      <path d="M6 7h12v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" />
      <path d="M9.5 11.5h5" />
      <path d="M8 4h8l1 3H7z" />
    </SvgIcon>
  );
}

export function SparkIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
    </SvgIcon>
  );
}

export function LockIcon(props) {
  return (
    <SvgIcon {...props}>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7.5A4 4 0 0 1 12 3.5a4 4 0 0 1 4 4V10" />
    </SvgIcon>
  );
}

export function LoginIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M14 5h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l-5-5 5-5" />
      <path d="M5 12h11" />
    </SvgIcon>
  );
}

export function SettingsIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.1" />
      <path d="M12 19.1v2.1" />
      <path d="M4.9 4.9l1.5 1.5" />
      <path d="M17.6 17.6l1.5 1.5" />
      <path d="M2.8 12h2.1" />
      <path d="M19.1 12h2.1" />
      <path d="M4.9 19.1l1.5-1.5" />
      <path d="M17.6 6.4l1.5-1.5" />
    </SvgIcon>
  );
}

export function FolderIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M3.5 7.5h6l1.8 2h9.2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <path d="M3.5 7.5v-1a2 2 0 0 1 2-2H9l1.5 1.7" />
    </SvgIcon>
  );
}

export function ChevronRightIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M9 6l6 6-6 6" />
    </SvgIcon>
  );
}

export function ChevronDownIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M6 9l6 6 6-6" />
    </SvgIcon>
  );
}

export function PlusIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </SvgIcon>
  );
}

export function CloseIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </SvgIcon>
  );
}
