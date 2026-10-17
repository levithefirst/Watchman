type P = { size?: number; className?: string };
const svg = (size: number, className: string | undefined, children: React.ReactNode, sw = 1.8) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    {children}
  </svg>
);

export const Shield = ({ size = 18, className }: P) => svg(size, className, <><path d="M12 3l7.5 2.8v5.7c0 4.8-3.2 8.5-7.5 10-4.3-1.5-7.5-5.2-7.5-10V5.8L12 3z" /><path d="M8.8 12.2l2.3 2.3 4.2-4.4" /></>);
export const Check = ({ size = 16, className }: P) => svg(size, className, <path d="M5 12.5l4.2 4.2L19 7" />, 2.2);
export const Cross = ({ size = 16, className }: P) => svg(size, className, <><path d="M7 7l10 10" /><path d="M17 7L7 17" /></>, 2);
export const Minus = ({ size = 16, className }: P) => svg(size, className, <path d="M6 12h12" />, 2);
export const Lock = ({ size = 18, className }: P) => svg(size, className, <><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 018 0v2.5" /></>);
export const Key = ({ size = 18, className }: P) => svg(size, className, <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l2.5 2.5M14 9l2 2" /></>);
export const Arrow = ({ size = 16, className }: P) => svg(size, className, <><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></>);
export const External = ({ size = 14, className }: P) => svg(size, className, <><path d="M14 5h5v5" /><path d="M19 5l-8 8" /><path d="M18 14v4a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 014 18V7.5A1.5 1.5 0 015.5 6H10" /></>);
export const Alert = ({ size = 18, className }: P) => svg(size, className, <><path d="M12 4l9 16H3l9-16z" /><path d="M12 10v4.5" /><path d="M12 17.5v.01" /></>);
export const Info = ({ size = 18, className }: P) => svg(size, className, <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8v.01" /></>);
export const Chevron = ({ size = 16, className }: P) => svg(size, className, <path d="M6 9l6 6 6-6" />);
export const Spinner = ({ size = 16, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`spin ${className ?? ""}`} aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.4" />
    <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);
