function Svg({ children, className = 'h-5 w-5', ...rest }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      {children}
    </svg>
  )
}

export const SearchIcon = (p) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
)
export const PlusIcon = (p) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
export const EditIcon = (p) => (
  <Svg {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
    <path d="m13.5 6.5 4 4" />
  </Svg>
)
export const TrashIcon = (p) => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
)
export const RestoreIcon = (p) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.7" />
    <path d="M4 4v4.7h4.7" />
  </Svg>
)
export const CloseIcon = (p) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
)
export const LogoutIcon = (p) => (
  <Svg {...p}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    <path d="M9 8l-4 4 4 4M5 12h10" />
  </Svg>
)
export const PinIcon = (p) => (
  <Svg {...p}>
    <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Svg>
)
export const KeyIcon = (p) => (
  <Svg {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12 9-9M17 6l3 3M15 8l2 2" />
  </Svg>
)
export const UserIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
  </Svg>
)
export const LockIcon = (p) => (
  <Svg {...p}>
    <rect x="5" y="10" width="14" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Svg>
)
export const EyeIcon = (p) => (
  <Svg {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
)
export const EyeOffIcon = (p) => (
  <Svg {...p}>
    <path d="M3 3l18 18M10.6 5.1A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.7-1.3" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Svg>
)
export const ArrowLeftIcon = (p) => (
  <Svg {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
)
export const MenuIcon = (p) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
)
export const MapIcon = (p) => (
  <Svg {...p}>
    <path d="M9 4 3 6.5v13.5L9 17.5l6 2.5 6-2.5V4l-6 2.5L9 4Z" />
    <path d="M9 4v13.5M15 6.5V20" />
  </Svg>
)
export const DropIcon = (p) => (
  <Svg {...p}>
    <path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11Z" />
  </Svg>
)
export const UsersIcon = (p) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c1-3.3 3.5-5 6.5-5s5.5 1.7 6.5 5" />
    <path d="M15.5 4.6a3.5 3.5 0 0 1 0 6.8M18 15.4c1.8.7 3 2.2 3.5 4.6" />
  </Svg>
)
export const ListIcon = (p) => (
  <Svg {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1" />
    <circle cx="4.5" cy="12" r="1" />
    <circle cx="4.5" cy="18" r="1" />
  </Svg>
)
export const ChevronDownIcon = (p) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
)
export const InboxIcon = (p) => (
  <Svg {...p}>
    <path d="M4 13V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7" />
    <path d="M4 13h4l1.5 3h5l1.5-3h4v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5Z" />
  </Svg>
)
export const CheckIcon = (p) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
)
export const DownloadIcon = (p) => (
  <Svg {...p}>
    <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
  </Svg>
)
export const QuestionIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" />
    <path d="M12 17.2v.1" />
  </Svg>
)
export const PrintIcon = (p) => (
  <Svg {...p}>
    <path d="M7 8V4h10v4" />
    <rect x="3" y="8" width="18" height="8" rx="2" />
    <path d="M7 14h10v6H7z" />
  </Svg>
)
export const SheetIcon = (p) => (
  <Svg {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M4 9h16M4 15h16M10 9v12" />
  </Svg>
)
export const ShieldIcon = (p) => (
  <Svg {...p}>
    <path d="M12 3 5 6v5.5c0 4.4 3 8.2 7 9.5 4-1.3 7-5.1 7-9.5V6l-7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
)
/** Points left (towards the end in RTL); rotate it with a class for the other directions. */
export const ChevronIcon = (p) => (
  <Svg {...p}>
    <path d="m15 6-6 6 6 6" />
  </Svg>
)
export const BookIcon = (p) => (
  <Svg {...p}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
    <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
    <path d="M8 7h8M8 11h6" />
  </Svg>
)
export const ExternalIcon = (p) => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Svg>
)
export const CopyIcon = (p) => (
  <Svg {...p}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </Svg>
)
export const InfoIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 7.6v.1" />
  </Svg>
)
export const AlertIcon = (p) => (
  <Svg {...p}>
    <path d="M10.3 4.3 2.6 17.6A2 2 0 0 0 4.3 20.6h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" />
    <path d="M12 9.5v4M12 17v.1" />
  </Svg>
)
export const BulbIcon = (p) => (
  <Svg {...p}>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />
  </Svg>
)
export const ChartIcon = (p) => (
  <Svg {...p}>
    <path d="M4 20h16" />
    <path d="M7 16v-5M12 16V7M17 16v-8" />
  </Svg>
)
export const HomeIcon = (p) => (
  <Svg {...p}>
    <path d="M4 10.5 12 4l8 6.5" />
    <path d="M6 9v10h12V9" />
    <path d="M10 19v-5h4v5" />
  </Svg>
)
export const MegaphoneIcon = (p) => (
  <Svg {...p}>
    <path d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1z" />
    <path d="M16 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11" />
  </Svg>
)
export const CalendarIcon = (p) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
)
export const GridIcon = (p) => (
  <Svg {...p}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </Svg>
)
export const CursorIcon = (p) => (
  <Svg {...p}>
    <path d="M5 3l14 7.5-6.2 1.8L10 18.5z" />
  </Svg>
)
export const ZoomInIcon = (p) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M20 20l-4.6-4.6M10.5 7.5v6M7.5 10.5h6" />
  </Svg>
)
export const ZoomOutIcon = (p) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M20 20l-4.6-4.6M7.5 10.5h6" />
  </Svg>
)
export const HandIcon = (p) => (
  <Svg {...p}>
    <path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v7.5c0 4-2.5 7-6.2 7-2.6 0-4-1.2-5.6-3.4L3.4 14a1.5 1.5 0 0 1 2.3-1.9L8 14" />
  </Svg>
)
export const DrawIcon = (p) => (
  <Svg {...p}>
    <path d="M4 17.5l4.5-5 4 3.5 6-8" />
    <circle cx="4" cy="17.5" r="1.4" />
    <circle cx="8.5" cy="12.5" r="1.4" />
    <circle cx="12.5" cy="16" r="1.4" />
    <circle cx="18.5" cy="8" r="1.4" />
  </Svg>
)
export const PinPlusIcon = (p) => (
  <Svg {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
    <path d="M12 7.2v5.6M9.2 10h5.6" />
  </Svg>
)
export const ExtentIcon = (p) => (
  <Svg {...p}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Svg>
)
export const CameraIcon = (p) => (
  <Svg {...p}>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
)
