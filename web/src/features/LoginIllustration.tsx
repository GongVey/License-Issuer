import { useId, type CSSProperties } from 'react';

// Flat commercial illustration for the sign-in panel: a laptop running the console, a phone showing an activated
// license, and around them a floating license card, a key, a shield and a plant. Colors come from --ill-* tokens
// (styles.css), which derive from the brand accent and switch for dark mode. Motion is slow and small, and stops
// under prefers-reduced-motion.
const delay = (s: number) => ({ animationDelay: `${s}s` }) as CSSProperties;

function Sparkle({ x, y, r, fill, d }: { x: number; y: number; r: number; fill: string; d: number }) {
  return (
    <path className="ill-twinkle" style={delay(d)} fill={fill}
      d={`M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`} />
  );
}

export function LoginIllustration({ className }: { className?: string }) {
  // Gradient ids must be unique per instance: a hidden copy (desktop panel on phones) would otherwise own them.
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 640 480" className={className} aria-hidden preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={`${id}-card`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--ill-jade-hi)' }} />
          <stop offset=".55" style={{ stopColor: 'var(--ill-jade)' }} />
          <stop offset="1" style={{ stopColor: 'var(--ill-jade-lo)' }} />
        </linearGradient>
        <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--ill-jade)', stopOpacity: 0.28 }} />
          <stop offset="1" style={{ stopColor: 'var(--ill-jade)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>

      {/* Backdrop shapes */}
      <circle cx="330" cy="250" r="196" fill="var(--ill-blob)" />
      <circle cx="560" cy="108" r="34" fill="var(--ill-mint)" />
      <circle cx="96" cy="388" r="20" fill="var(--ill-mint)" />
      <ellipse cx="330" cy="352" rx="210" ry="9" fill="var(--ill-shadow)" />
      <ellipse cx="171" cy="420" rx="52" ry="6" fill="var(--ill-shadow)" />

      {/* Issuance link: the card hands a license to the phone */}
      <path className="ill-flow" d="M402 196 C 340 236, 250 214, 196 252" fill="none" stroke="var(--ill-jade)" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 7" />

      {/* Laptop */}
      <g>
        <rect x="186" y="132" width="288" height="198" rx="14" fill="var(--ill-ink)" />
        <rect x="198" y="144" width="264" height="174" rx="5" fill="var(--ill-paper)" />
        <rect x="198" y="144" width="40" height="174" fill="var(--ill-gray)" />
        <rect x="208" y="154" width="20" height="20" rx="5" fill="var(--ill-ink)" />
        <rect x="221" y="167" width="4" height="4" rx="1" fill="var(--ill-jade-hi)" />
        {[188, 204, 220, 236].map((y, i) => <rect key={y} x="211" y={y} width="14" height="4" rx="2" fill={i === 0 ? 'var(--ill-jade)' : 'var(--ill-line)'} />)}
        <rect x="250" y="156" width="70" height="7" rx="3.5" fill="var(--ill-ink-2)" />
        <rect x="250" y="168" width="44" height="5" rx="2.5" fill="var(--ill-line)" />
        {[250, 318, 386].map((x, i) => (
          <g key={x}>
            <rect x={x} y="184" width="62" height="38" rx="6" fill="var(--ill-bg)" />
            <rect x={x + 8} y="192" width="22" height="4" rx="2" fill="var(--ill-line)" />
            <rect x={x + 8} y="202" width={i === 0 ? 34 : 26} height="9" rx="3" fill={i === 0 ? 'var(--ill-jade)' : 'var(--ill-ink-2)'} />
          </g>
        ))}
        <path d="M250 304 L274 292 L298 296 L322 278 L346 284 L370 262 L394 268 L418 248 L448 240 V308 H250Z" fill={`url(#${id}-area)`} />
        <path className="ill-draw" d="M250 304 L274 292 L298 296 L322 278 L346 284 L370 262 L394 268 L418 248 L448 240" fill="none" stroke="var(--ill-jade)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="448" cy="240" r="4.5" fill="var(--ill-paper)" stroke="var(--ill-jade)" strokeWidth="2.5" />
        <rect x="156" y="330" width="348" height="14" rx="7" fill="var(--ill-gray-2)" />
        <rect x="300" y="330" width="60" height="5" rx="2.5" fill="var(--ill-line)" />
      </g>

      {/* Plant */}
      <g className="ill-sway">
        <path d="M512 262 C 494 238, 494 214, 508 196 C 520 220, 520 244, 512 262Z" fill="var(--ill-jade)" />
        <path d="M518 266 C 520 236, 536 216, 556 210 C 554 236, 540 256, 518 266Z" fill="var(--ill-jade-hi)" />
        <path d="M514 268 C 496 256, 480 252, 466 256 C 476 270, 494 276, 514 268Z" fill="var(--ill-jade-lo)" />
      </g>
      <path d="M494 266 H538 L532 328 H500Z" fill="var(--ill-ink-2)" />
      <rect x="490" y="262" width="52" height="10" rx="4" fill="var(--ill-ink)" />

      {/* Phone */}
      <g>
        <rect x="128" y="244" width="86" height="172" rx="17" fill="var(--ill-ink)" />
        <rect x="135" y="256" width="72" height="148" rx="11" fill="var(--ill-paper)" />
        <rect x="160" y="250" width="22" height="4" rx="2" fill="var(--ill-ink-2)" />
        <circle cx="171" cy="292" r="17" fill="var(--ill-mint)" />
        <circle cx="171" cy="292" r="12" fill="var(--ill-jade)" />
        <path d="M165 292 L169.5 296.5 L177 288" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="149" y="318" width="44" height="6" rx="3" fill="var(--ill-ink-2)" />
        <rect x="155" y="329" width="32" height="4" rx="2" fill="var(--ill-line)" />
        <rect x="146" y="342" width="50" height="14" rx="7" fill="var(--ill-mint)" />
        <rect x="156" y="347" width="30" height="4" rx="2" fill="var(--ill-jade)" />
        <rect x="145" y="378" width="52" height="16" rx="6" fill="var(--ill-jade)" />
      </g>

      {/* Shield */}
      <g className="ill-float" style={delay(-2)}>
        <path d="M86 150 L112 160 V182 C112 199 101 210 86 217 C71 210 60 199 60 182 V160Z" fill="var(--ill-paper)" stroke="var(--ill-line)" strokeWidth="2" />
        <path d="M76 184 L84 192 L98 176" fill="none" stroke="var(--ill-jade)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Key */}
      <g className="ill-float-tilt" style={delay(-4)}>
        <g transform="translate(150 84) rotate(-24)">
          <circle r="21" fill="var(--ill-ink)" />
          <circle r="7.5" fill="var(--ill-blob)" />
          <rect x="17" y="-5.5" width="62" height="11" rx="3" fill="var(--ill-ink)" />
          <rect x="58" y="3" width="7" height="12" rx="2" fill="var(--ill-ink)" />
          <rect x="70" y="3" width="7" height="9" rx="2" fill="var(--ill-ink)" />
        </g>
      </g>

      {/* License card */}
      <g className="ill-float">
        <g transform="translate(392 62) rotate(8)">
          <rect width="196" height="120" rx="15" fill={`url(#${id}-card)`} />
          <rect width="196" height="120" rx="15" fill="none" stroke="white" strokeOpacity=".2" />
          <path d="M0 15 A15 15 0 0 1 15 0 H120 L60 120 H15 A15 15 0 0 1 0 105Z" fill="white" opacity=".06" />
          <rect x="18" y="16" width="20" height="20" rx="5.5" fill="white" />
          <rect x="30" y="28" width="4.5" height="4.5" rx="1" fill="var(--ill-jade)" />
          <text x="178" y="30" textAnchor="end" fontSize="9" letterSpacing="2.2" fill="white" opacity=".75" fontFamily="Inter, system-ui, sans-serif" fontWeight="600">LICENSE</text>
          <rect x="18" y="48" width="30" height="23" rx="5" fill="var(--ill-warm)" />
          <path d="M18 59.5 H48 M33 48 V71" stroke="var(--ill-ink)" strokeOpacity=".25" strokeWidth="1.2" />
          <text x="18" y="96" fontSize="12.5" letterSpacing="1.2" fill="white" fontFamily="ui-monospace, 'SF Mono', Menlo, monospace">LIC-7Q4M ···· K2XD</text>
          <rect x="18" y="104" width="54" height="4" rx="2" fill="white" opacity=".45" />
          <rect x="150" y="100" width="28" height="8" rx="4" fill="white" opacity=".85" />
        </g>
      </g>

      <Sparkle x={300} y={82} r={9} fill="var(--ill-warm)" d={0} />
      <Sparkle x={604} y={232} r={7} fill="var(--ill-jade-hi)" d={1.1} />
      <Sparkle x={64} y={300} r={7} fill="var(--ill-jade-hi)" d={2.2} />
      <Sparkle x={462} y={414} r={6} fill="var(--ill-warm)" d={0.6} />
    </svg>
  );
}
