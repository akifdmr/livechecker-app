// ============================================================
// ANIMATED LOGO — Login ekranı için büyük hareketli logo
// ============================================================
interface AnimatedLogoProps {
  size?: number;
  withText?: boolean;
}

export default function AnimatedLogo({
  size = 120,
  withText = true,
}: AnimatedLogoProps) {
  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        fill="none"
        className="animated-logo"
      >
        <defs>
          <linearGradient id="loginCardGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4CAF50">
              <animate
                attributeName="stop-color"
                values="#4CAF50;#8BC34A;#4CAF50"
                dur="3s"
                repeatCount="indefinite"
              />
            </stop>
            <stop offset="100%" stopColor="#2E7D32">
              <animate
                attributeName="stop-color"
                values="#2E7D32;#4CAF50;#2E7D32"
                dur="3s"
                repeatCount="indefinite"
              />
            </stop>
          </linearGradient>

          <filter id="loginGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Pulse halka */}
        <circle cx="32" cy="32" r="28" fill="#4CAF50" opacity="0.15">
          <animate attributeName="r" values="26;31;26" dur="2.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.25;0.03;0.25" dur="2.5s" repeatCount="indefinite" />
        </circle>

        {/* İkinci pulse halka (gecikmeli) */}
        <circle cx="32" cy="32" r="28" fill="#4CAF50" opacity="0.1">
          <animate attributeName="r" values="26;31;26" dur="2.5s" begin="1.25s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.2;0.02;0.2" dur="2.5s" begin="1.25s" repeatCount="indefinite" />
        </circle>

        {/* Kart gövdesi — süzülme */}
        <g>
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0; 0 -1.5; 0 0"
            dur="3s"
            repeatCount="indefinite"
          />

          <rect
            x="8"
            y="16"
            width="48"
            height="32"
            rx="6"
            fill="url(#loginCardGrad)"
            filter="url(#loginGlow)"
          />

          <rect x="8" y="23" width="48" height="5" fill="#0d1017" opacity="0.85" />

          <rect x="14" y="34" width="9" height="7" rx="1.5" fill="#FFD54F">
            <animate
              attributeName="opacity"
              values="1;0.4;1"
              dur="1.5s"
              repeatCount="indefinite"
            />
          </rect>

          <path
            d="M30 40 L36 46 L50 32"
            stroke="#0d1017"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray="30"
            strokeDashoffset="30"
          >
            <animate
              attributeName="stroke-dashoffset"
              values="30;0;30"
              dur="3s"
              repeatCount="indefinite"
              keyTimes="0;0.5;1"
            />
          </path>
        </g>

        {/* Parçacıklar */}
        <circle cx="16" cy="20" r="1" fill="#8BC34A">
          <animate attributeName="cy" values="20;14;20" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle cx="48" cy="22" r="1.2" fill="#FFD54F">
          <animate attributeName="cy" values="22;15;22" dur="2.5s" begin="0.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;1;0" dur="2.5s" begin="0.5s" repeatCount="indefinite" />
        </circle>
      </svg>

      {withText && (
        <div className="mt-6 text-center">
          <h1
            className="text-3xl font-bold tracking-wide"
            style={{
              background:
                'linear-gradient(90deg, #4CAF50 0%, #8BC34A 50%, #4CAF50 100%)',
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'shine 3s linear infinite',
            }}
          >
            LiveChecker
          </h1>
          <p className="mt-1 text-xs tracking-widest text-gray-500 uppercase">
            Secure Card Verification
          </p>
        </div>
      )}

      <style>{`
        @keyframes shine {
          to {
            background-position: 200% center;
          }
        }
      `}</style>
    </div>
  );
}