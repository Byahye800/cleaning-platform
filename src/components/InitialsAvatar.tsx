import { color, font, radius } from '@/lib/theme';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function InitialsAvatar({ name, size = 64 }: { name: string; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: radius.full,
        background: color.navy,
        color: color.textInverse,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: font.weight.bold,
        fontSize: Math.round(size * 0.36),
      }}
    >
      {getInitials(name)}
    </div>
  );
}
