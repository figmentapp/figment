import React from 'react';

// prettier-ignore
const ICON_MAP = {
    'dots-vertical-rounded': 'M12 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 12c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
    'square': 'M20 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1z',
    'undo': 'M9 10h6c1.654 0 3 1.346 3 3s-1.346 3-3 3h-3v2h3c2.757 0 5-2.243 5-5s-2.243-5-5-5H9V5L4 9l5 4v-3z',
    'x': 'm16.192 6.344-4.243 4.242-4.242-4.242-1.414 1.414L10.535 12l-4.242 4.242 1.414 1.414 4.242-4.242 4.243 4.242 1.414-1.414L13.364 12l4.242-4.242z',
}

export default function Icon({ name, size, fill = 'black', onClick, tooltip, className }) {
  let d = ICON_MAP[name];
  if (!d) {
    d = ICON_MAP['square'];
    fill = '#f0f';
  }
  return (
    <svg fill={fill} className={className} onClick={onClick} viewBox={`0 0 24 24`} width={size} title={tooltip}>
      {Array.isArray(d) ? d.map((path, i) => <path key={i} d={path} />) : <path d={d} />}
    </svg>
  );
}
