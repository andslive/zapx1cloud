interface InstanceColorClasses {
  dot: string;
  border: string;
  bg: string;
}

// Classes escritas por extenso (não interpoladas) de propósito: o Tailwind
// escaneia o texto-fonte em busca de classes completas — strings montadas
// dinamicamente (`bg-${token}-500`) seriam removidas no build de produção.
const COLOR_CLASSES: Record<string, InstanceColorClasses> = {
  blue: { dot: 'bg-blue-500', border: 'border-l-blue-500', bg: 'bg-blue-500/[0.06]' },
  cyan: { dot: 'bg-cyan-500', border: 'border-l-cyan-500', bg: 'bg-cyan-500/[0.06]' },
  yellow: { dot: 'bg-yellow-500', border: 'border-l-yellow-500', bg: 'bg-yellow-500/[0.06]' },
  purple: { dot: 'bg-purple-500', border: 'border-l-purple-500', bg: 'bg-purple-500/[0.06]' },
  orange: { dot: 'bg-orange-500', border: 'border-l-orange-500', bg: 'bg-orange-500/[0.06]' },
  green: { dot: 'bg-green-500', border: 'border-l-green-500', bg: 'bg-green-500/[0.06]' },
  sky: { dot: 'bg-sky-500', border: 'border-l-sky-500', bg: 'bg-sky-500/[0.06]' },
  pink: { dot: 'bg-pink-500', border: 'border-l-pink-500', bg: 'bg-pink-500/[0.06]' },
  amber: { dot: 'bg-amber-500', border: 'border-l-amber-500', bg: 'bg-amber-500/[0.06]' },
  teal: { dot: 'bg-teal-500', border: 'border-l-teal-500', bg: 'bg-teal-500/[0.06]' },
  red: { dot: 'bg-red-500', border: 'border-l-red-500', bg: 'bg-red-500/[0.06]' },
  indigo: { dot: 'bg-indigo-500', border: 'border-l-indigo-500', bg: 'bg-indigo-500/[0.06]' },
  slate: { dot: 'bg-slate-500', border: 'border-l-slate-500', bg: 'bg-slate-500/[0.06]' },
};

const COLOR_TOKENS = Object.keys(COLOR_CLASSES).filter((t) => t !== 'slate');

// Mapeamento fixo sugerido pela referência visual — mantém a mesma cor por
// instância entre sessões/filtros em vez de depender só da ordem de leitura.
const NAME_TO_TOKEN: Record<string, string> = {
  chip19: 'blue',
  chip26novo: 'cyan',
  '9mmx47': 'yellow',
  chip16: 'purple',
  chip17new: 'orange',
  canal21: 'green',
  canall32: 'sky',
  canal36: 'pink',
  canal46: 'amber',
  canal42: 'teal',
};

/** Cor estável por nome de instância, com fallback cíclico para nomes fora do mapeamento fixo. */
export function getInstanceColorClasses(instanceName: string | null | undefined): InstanceColorClasses {
  if (!instanceName) return COLOR_CLASSES.slate;
  const key = instanceName.trim().toLowerCase();
  const fixedToken = NAME_TO_TOKEN[key];
  if (fixedToken) return COLOR_CLASSES[fixedToken];

  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return COLOR_CLASSES[COLOR_TOKENS[hash % COLOR_TOKENS.length]];
}
