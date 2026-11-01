import { fetchPublicJson, publicUrl, sha256 } from './investigation.mjs';

const PRR_EDITOR = '61140a0107819099529af103';
export const FUNDING_SOURCES = [
  { key: 'prr-projects', id: '6717dcff1b0eaad60ac50090', editor: PRR_EDITOR,
    title: 'PRR — projetos', purpose: 'Identificar projetos e apoios declarados; aprovação não equivale a execução ou pagamento.' },
  { key: 'prr-entities', id: '6717dca11b0eaad60ac5008f', editor: PRR_EDITOR,
    title: 'PRR — entidades', purpose: 'Examinar entidades e papéis no financiamento; beneficiário não é automaticamente fornecedor.' },
  { key: 'prr-agreements', id: '6718c25bbbf3654d2bc5008b', editor: PRR_EDITOR,
    title: 'PRR — contratualização', purpose: 'Consultar financiamento contratualizado; não confundir com contratação pública ou montantes pagos.' },
  { key: 'prr-locations', id: '6717dc1f1b0eaad60ac5008e', editor: PRR_EDITOR,
    title: 'PRR — localizações', purpose: 'Examinar distribuição geográfica; linhas por território podem repetir projetos e valores.' },
  { key: 'prr-contracts', id: '6717db451b0eaad60ac5008c', editor: PRR_EDITOR,
    title: 'PRR — contratos públicos', purpose: 'Consultar contratos associados ao PRR; confirmar vínculo ao projeto e datas na fonte original.' },
  { key: 'pt2020', id: '60255885454ae3372d0acac7', editor: '600850ac454ae38cbce87116',
    title: 'Portugal 2020 — beneficiários e operações', purpose: 'Consultar listas de beneficiários e operações; distinguir fundos, períodos e aprovado/executado/pago.' },
];

export function fundingUrl(key, offset = 0) {
  const source = FUNDING_SOURCES.find((source) => source.key === key);
  if (!source || offset !== 0) throw new Error('Fonte de fundos inválida; escolhe um conjunto da lista, sem paginação.');
  return new URL(`https://dados.gov.pt/api/1/datasets/${source.id}/`);
}

export async function collectFunding(key, offset = 0) {
  const url = fundingUrl(key, offset);
  const source = FUNDING_SOURCES.find((source) => source.key === key);
  const { data, rawText, collectedAt } = await fetchPublicJson(url);
  if (data?.id !== source.id || data.organization?.id !== source.editor ||
      typeof data.title !== 'string' || !data.title.trim() || !publicUrl(data.page) ||
      !Array.isArray(data.resources) || data.resources.length > 100) {
    throw new Error('Metadados inesperados ou editor diferente do conjunto oficial; recursos não apresentados.');
  }
  const resources = data.resources.map((resource) => {
    if (!resource || typeof resource !== 'object' || typeof resource.title !== 'string' ||
        typeof resource.format !== 'string' || !publicUrl(resource.url)) throw new Error('Recurso com metadados ou ligação inválidos.');
    return { title: resource.title, format: resource.format, url: publicUrl(resource.url),
      updatedAt: String(resource.last_modified || '') };
  });
  return { source: 'funding', key, title: data.title, purpose: source.purpose, publisher: String(data.organization.name || ''),
    datasetUrl: publicUrl(data.page), requestUrl: url.href, collectedAt,
    license: String(data.license_title || data.license || 'Não indicada'),
    updatedAt: String(data.last_modified || ''), resources, rawText, hash: await sha256(rawText),
    method: 'official-funding-catalogue-v1', scope: 'metadata-only' };
}
