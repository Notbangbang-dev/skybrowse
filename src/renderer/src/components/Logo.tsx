interface LogoProps {
    size?: number;
}

export default function Logo({ size = 26 }: LogoProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 256 256" aria-hidden="true">
            <defs>
                <linearGradient id="skybrowse-logo-bg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#141b3d" />
                    <stop offset="0.55" stopColor="#1e2649" />
                    <stop offset="1" stopColor="#372e63" />
                </linearGradient>
            </defs>
            <rect width="256" height="256" rx="56" fill="url(#skybrowse-logo-bg)" />
            <path d="M40 136 L220 40 L146 220 L114 146 Z" fill="#f4f6ff" />
            <path d="M114 146 L220 40 L100 152 Z" fill="#c9cdf2" opacity="0.55" />
        </svg>
    );
}
