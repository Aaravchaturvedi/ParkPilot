// Production design tokens. One palette/typography source for both apps so
// customer + partner look like one product.
export const theme = {
  color: {
    brand: '#4f46e5',
    brandDark: '#4338ca',
    brandSoft: '#eef2ff',
    ink: '#111827',
    sub: '#6b7280',
    faint: '#9ca3af',
    line: '#e5e7eb',
    bg: '#f8fafc',
    card: '#ffffff',
    successBg: '#d1fae5',
    successFg: '#065f46',
    warnBg: '#fef3c7',
    warnFg: '#92400e',
    infoBg: '#dbeafe',
    infoFg: '#1e40af',
    dangerBg: '#fee2e2',
    dangerFg: '#991b1b',
    danger: '#dc2626',
  },
  radius: { sm: 8, md: 12, lg: 16, pill: 999 },
  type: { hero: 40, title: 20, h: 18, body: 15, small: 13, tiny: 12 },
} as const;
