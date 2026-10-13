/** Sources observed on the official zh-CN page, 2026-10-13. User-requested use. */
export const OFFICIAL_PAGE = 'https://www.cyberpunk.net/zh-cn/edgerunners2';
const asset = (name: string) => `${import.meta.env?.BASE_URL ?? '/'}assets/edgerunners2/${name}`;
export const officialAssets = {
  poster: asset('cover.jpg'),
  video: 'https://cdn-l-cyberpunk.cdprojektred.com/video/CPER2_landing_page_vid_FIN_1920x1080_h264.mp4',
  characters: {
    weak: asset('weak.png'),
    d: asset('d.png'),
    roman: asset('roman.png'),
    talia: asset('talia.png'),
    avida: asset('avida.png'),
    sal: asset('sal.png'),
    jessie: asset('jessie.png'),
    kitano: asset('kitano.png'),
    richard: asset('richard.png'),
    kiril: asset('kiril.png')
  } as Record<string, string>
};
export function characterImage(id: string, imageUrl: string | null): string | null {
  return imageUrl || officialAssets.characters[id] || null;
}
