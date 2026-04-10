export const CATEGORIES = {
  food:          { label: 'Comida',          icon: '🍽',  color: '#FF6B6B' },
  transport:     { label: 'Transporte',      icon: '⛽',  color: '#4ECDC4' },
  health:        { label: 'Salud',           icon: '💊',  color: '#45B7D1' },
  entertainment: { label: 'Entretenimiento', icon: '🎬',  color: '#96CEB4' },
  shopping:      { label: 'Compras',         icon: '🛍',  color: '#FFEAA7' },
  other:         { label: 'Otros',           icon: '📦',  color: '#DDA0DD' },
} as const

export type CategoryKey = keyof typeof CATEGORIES

export const SOURCES = {
  produbanco: { label: 'Produbanco',     color: '#003087' },
  deuna:      { label: 'DeUna',          color: '#FF4500' },
  transfer:   { label: 'Transferencia',  color: '#708090' },
  manual:     { label: 'Manual',         color: '#808080' },
} as const

export type SourceKey = keyof typeof SOURCES
