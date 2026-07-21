// Two small jobs only. Everything visual is CSS; nothing here gates content.

// 1. Mark the section currently in view on the side rail.
const rail = document.querySelector('.rail');
if (rail && 'IntersectionObserver' in window) {
  const links = new Map(
    [...rail.querySelectorAll('a[href^="#"]')].map((a) => [a.getAttribute('href').slice(1), a]),
  );
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const link = links.get(entry.target.id);
      if (!link) continue;
      link.style.color = entry.isIntersecting ? 'var(--text)' : '';
      const bar = link.querySelector('i');
      if (bar) bar.style.width = entry.isIntersecting ? '30px' : '';
    }
  }, { rootMargin: '-45% 0px -45% 0px' });
  for (const id of links.keys()) {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  }
}

// 2. Don't keep decoding the hero video while it is off screen.
const hero = document.querySelector('.stage video');
if (hero && 'IntersectionObserver' in window) {
  new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) hero.play().catch(() => {});
      else hero.pause();
    }
  }, { threshold: 0.1 }).observe(hero);
}
