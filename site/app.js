// Two jobs. Neither one gates content: if this file never runs, the page is
// complete, only the gutter readout stops tracking.

const gutterId = document.querySelector('.gutter-id');
const gutterT = document.querySelector('.gutter-t');
const scenes = [...document.querySelectorAll('[data-step]')];

if (gutterId && gutterT && scenes.length && 'IntersectionObserver' in window) {
  // Report the recorded step the current scene corresponds to.
  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    gutterId.textContent = visible.target.dataset.step ?? '';
    gutterT.textContent = visible.target.dataset.t ?? '';
    // only count a scene once it crosses the middle band, so the readout
    // matches the scene actually filling the viewport
  }, { rootMargin: '-40% 0px -40% 0px', threshold: 0 });
  for (const scene of scenes) observer.observe(scene);
}

// Stop decoding the hero loop once it is off screen.
const hero = document.querySelector('.hero-vid');
if (hero && 'IntersectionObserver' in window) {
  new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) hero.play().catch(() => {});
      else hero.pause();
    }
  }, { threshold: 0.05 }).observe(hero);
}
