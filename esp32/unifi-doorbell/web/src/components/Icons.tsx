import type { ComponentChildren } from 'preact'

// A handful of stroke icons (lucide geometry), inlined to keep the
// firmware's filesystem image small.
function Svg({ children, size = 18 }: { children: ComponentChildren; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const BellIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M10.27 21a2 2 0 0 0 3.46 0" />
    <path d="M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33" />
  </Svg>
)

export const BellRingIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M10.27 21a2 2 0 0 0 3.46 0" />
    <path d="M22 8c0-2.3-.8-4.3-2-6" />
    <path d="M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33" />
    <path d="M4 2C2.8 3.7 2 5.7 2 8" />
  </Svg>
)

export const NetworkIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <rect x="16" y="16" width="6" height="6" rx="1" />
    <rect x="2" y="16" width="6" height="6" rx="1" />
    <rect x="9" y="2" width="6" height="6" rx="1" />
    <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
    <path d="M12 12V8" />
  </Svg>
)

export const DoorIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M13 4h3a2 2 0 0 1 2 2v14" />
    <path d="M2 20h3" />
    <path d="M13 20h9" />
    <path d="M10 12v.01" />
    <path d="M13 4.56v16.88a.5.5 0 0 1-.6.49l-6.8-1.36A2 2 0 0 1 4 18.6V5.4a2 2 0 0 1 1.6-1.96l6.8-1.36a.5.5 0 0 1 .6.49Z" />
  </Svg>
)

export const RadioIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
    <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
    <circle cx="12" cy="12" r="2" />
    <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
    <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
  </Svg>
)

export const LogoutIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </Svg>
)

export const CheckIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
)

export const XIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Svg>
)

export const PlusIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </Svg>
)
