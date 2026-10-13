/** One shared observer: rerendered cards are unobserved before new cards register. */
let revealObserver: IntersectionObserver | undefined;
const watched = new Set<Element>();

export function revealElements(): void {
  if (!revealObserver) return;
  for (const element of watched) {
    if (!element.isConnected) { revealObserver.unobserve(element); watched.delete(element); }
  }
  document.querySelectorAll('.reveal:not(.is-visible)').forEach(element => {
    if (watched.has(element)) return;
    watched.add(element);
    revealObserver!.observe(element);
  });
}

export function setupMotion(): void {
  const video = document.querySelector<HTMLVideoElement>('#hero-video')!;
  const hero = document.querySelector<HTMLElement>('.hero')!;
  const toggle = document.querySelector<HTMLButtonElement>('#motion-toggle')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const small = matchMedia('(max-width: 780px)');
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  let enabled = !reduced.matches && !small.matches && !connection?.saveData;
  let inView = true;
  let userSelected = false;
  let playingRequest = 0;

  const sync = async () => {
    document.documentElement.dataset.motion = enabled ? 'on' : 'off';
    toggle.textContent = enabled ? '暂停动效 Ⅱ' : '播放动效 ▷';
    toggle.setAttribute('aria-pressed', String(enabled));
    const request = ++playingRequest;
    if (!enabled || !inView || document.hidden) { video.pause(); return; }
    if (!video.getAttribute('src')) video.src = video.dataset.source!;
    video.muted = true;
    try {
      await video.play();
      if (request !== playingRequest || !enabled || !inView || document.hidden) {
        if (!enabled || !inView || document.hidden) video.pause();
        return;
      }
      video.classList.add('is-playing');
    } catch {
      // Offline, codec and autoplay failures leave the local poster fully visible.
      if (request !== playingRequest) return;
      video.classList.remove('is-playing');
      enabled = false;
      document.documentElement.dataset.motion = 'off';
      toggle.textContent = '播放动效 ▷';
      toggle.setAttribute('aria-pressed', 'false');
    }
  };
  video.addEventListener('error',()=>{video.classList.remove('is-playing');enabled=false;void sync();});
  toggle.addEventListener('click',()=>{userSelected=true;enabled=!enabled;void sync();});
  reduced.addEventListener('change',()=>{enabled=!reduced.matches&&!small.matches&&!connection?.saveData;void sync();});
  small.addEventListener('change',()=>{if(!userSelected){enabled=!reduced.matches&&!small.matches&&!connection?.saveData;void sync();}});
  document.addEventListener('visibilitychange',()=>void sync());
  new IntersectionObserver(([entry])=>{inView=entry.isIntersecting;void sync();},{threshold:0.05}).observe(hero);

  if ('IntersectionObserver' in window) {
    revealObserver = new IntersectionObserver(entries=>{
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver!.unobserve(entry.target);
        watched.delete(entry.target);
      }
    },{threshold:0.06,rootMargin:'0px 0px 30px 0px'});
    document.documentElement.classList.add('motion-ready');
    revealElements();
  }
  void sync();
}
