import { fetchJson, type ModelItem, type ModelSource } from '../source';

/** Wikimedia Commons: no key, licence per file. All its 3D files are STL. */
const API = 'https://commons.wikimedia.org/w/api.php';
const PAGE = 24;

interface Page {
  index: number;
  title: string;
  imageinfo?: {
    url: string;
    size: number;
    thumburl?: string;
    descriptionurl: string;
    extmetadata?: Record<string, { value: string } | undefined>;
  }[];
}

/** the author field is HTML written by whoever uploaded the file: only its text is used (a parsed document runs nothing) */
const plainText = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent?.replace(/\s+/g, ' ').trim() ?? '';

export const commons: ModelSource = {
  id: 'commons',
  label: 'Wikimedia Commons',
  search: async ({ query, category, next, signal }) => {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      origin: '*',
      generator: 'search',
      gsrnamespace: '6',
      gsrsearch: [query, category, 'filetype:3d'].filter(Boolean).join(' '),
      gsrlimit: String(PAGE),
      gsroffset: next ?? '0',
      prop: 'imageinfo',
      iiprop: 'url|size|extmetadata',
      iiurlwidth: '256',
      iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist',
    });
    const answer = await fetchJson<{ query?: { pages?: Record<string, Page> }; continue?: { gsroffset?: number } }>(
      `${API}?${params}`,
      signal,
      {
        headers: { 'Api-User-Agent': 'Shap3D.ai model marketplace' },
      },
    );
    const items = Object.values(answer.query?.pages ?? {})
      .sort((a, b) => a.index - b.index)
      .flatMap((page): ModelItem[] => {
        const info = page.imageinfo?.[0];
        if (!info) {
          return [];
        }
        return [
          {
            sourceId: 'commons',
            id: page.title,
            title: page.title.replace(/^File:/, '').replace(/\.[^.]+$/, ''),
            author: plainText(info.extmetadata?.Artist?.value ?? ''),
            license: info.extmetadata?.LicenseShortName?.value,
            licenseUrl: info.extmetadata?.LicenseUrl?.value,
            thumbnail: info.thumburl,
            webUrl: info.descriptionurl,
            extra: { url: info.url, size: info.size },
          },
        ];
      });
    return { items, next: answer.continue?.gsroffset === undefined ? undefined : String(answer.continue.gsroffset) };
  },
  download: async (item) => ({
    main: 'model.stl',
    files: { 'model.stl': String(item.extra?.url) },
    size: Number(item.extra?.size) || undefined,
    stlMayBeMillimetres: true,
  }),
};
