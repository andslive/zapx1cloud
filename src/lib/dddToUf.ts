/**
 * Estimativa de estado (UF) a partir do DDD do telefone do lead.
 *
 * IMPORTANTE: isto NÃO é o endereço real do cliente. É uma aproximação
 * baseada no plano de numeração da Anatel (cada DDD pertence a uma UF fixa),
 * usada apenas porque não existe campo de estado/endereço salvo no lead.
 * Usar para tendência geográfica de vendas, não para decisões fiscais/logísticas.
 */
export const DDD_TO_UF: Record<string, string> = {
  '11': 'SP', '12': 'SP', '13': 'SP', '14': 'SP', '15': 'SP',
  '16': 'SP', '17': 'SP', '18': 'SP', '19': 'SP',
  '21': 'RJ', '22': 'RJ', '24': 'RJ',
  '27': 'ES', '28': 'ES',
  '31': 'MG', '32': 'MG', '33': 'MG', '34': 'MG', '35': 'MG', '37': 'MG', '38': 'MG',
  '41': 'PR', '42': 'PR', '43': 'PR', '44': 'PR', '45': 'PR', '46': 'PR',
  '47': 'SC', '48': 'SC', '49': 'SC',
  '51': 'RS', '53': 'RS', '54': 'RS', '55': 'RS',
  '61': 'DF',
  '62': 'GO', '64': 'GO',
  '63': 'TO',
  '65': 'MT', '66': 'MT',
  '67': 'MS',
  '68': 'AC',
  '69': 'RO',
  '71': 'BA', '73': 'BA', '74': 'BA', '75': 'BA', '77': 'BA',
  '79': 'SE',
  '81': 'PE', '87': 'PE',
  '82': 'AL',
  '83': 'PB',
  '84': 'RN',
  '85': 'CE', '88': 'CE',
  '86': 'PI', '89': 'PI',
  '91': 'PA', '93': 'PA', '94': 'PA',
  '92': 'AM', '97': 'AM',
  '95': 'RR',
  '96': 'AP',
  '98': 'MA', '99': 'MA',
};

export const UF_NAO_IDENTIFICADO = 'Não identificado';

/**
 * Extrai a UF estimada de um telefone. Aceita formatos com ou sem código
 * do país (55) e com ou sem símbolos (+, espaços, parênteses, hífen).
 */
export function dddToUf(phone: string | null | undefined): string {
  if (!phone) return UF_NAO_IDENTIFICADO;

  const digits = phone.replace(/\D/g, '');
  // remove código do país 55 quando presente e o número tem tamanho compatível
  // com DD + número local (10 ou 11 dígitos após o 55)
  const withoutCountryCode =
    digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
      ? digits.slice(2)
      : digits;

  if (withoutCountryCode.length < 10) return UF_NAO_IDENTIFICADO;

  const ddd = withoutCountryCode.slice(0, 2);
  return DDD_TO_UF[ddd] ?? UF_NAO_IDENTIFICADO;
}
