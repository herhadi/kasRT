(function () {
  const THEME_KEY = 'kasrt_theme';

  function getSavedTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    const normalized = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', normalized);
    localStorage.setItem(THEME_KEY, normalized);
  }

  function toggleTheme() {
    const current = getSavedTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    return next;
  }

  function initThemeToggle(buttonId, labelId) {
    const btn = document.getElementById(buttonId);
    const label = labelId ? document.getElementById(labelId) : null;
    if (!btn) return;

    const sync = () => {
      const theme = getSavedTheme();
      btn.setAttribute('aria-pressed', String(theme === 'dark'));
      btn.textContent = theme === 'dark' ? 'Mode: Dark' : 'Mode: Light';
      if (label) {
        label.textContent = theme === 'dark' ? 'Tampilan gelap aktif' : 'Tampilan terang aktif';
      }
    };

    btn.addEventListener('click', () => {
      toggleTheme();
      sync();
    });

    sync();
  }

  window.KASRT_THEME = {
    getSavedTheme,
    applyTheme,
    toggleTheme,
    initThemeToggle
  };

  applyTheme(getSavedTheme());
})();
