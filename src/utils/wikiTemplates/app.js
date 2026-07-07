// Wikifoo App Logic
// Uses Preact Signals for reactive state management

let scrollSpyObserver = null;

// State
const state = {
    currentPage: signal('{{CENTRAL_SLUG}}'),
    _history: signal(['{{CENTRAL_SLUG}}']),
    _historyIndex: signal(0),
    sidebarCollapsed: signal(false),
    tocCollapsed: signal(true),
    searchQuery: signal(''),
    currentTheme: signal('{{DEFAULT_THEME}}'),
    notes: {{WIKI_PAGES}}
};

// Computed values
const computedState = {
    canGoBack: computed(() => state._historyIndex.value > 0),
    canGoForward: computed(() => state._historyIndex.value < state._history.value.length - 1),
    filteredNotes: computed(() => {
        const query = state.searchQuery.value.toLowerCase();
        if (!query) return state.notes;
        return state.notes.filter(n =>
            n.title.toLowerCase().includes(query) ||
            n.slug.toLowerCase().includes(query)
        );
    })
};

// Initialize
function initWiki() {
    initTheme();
    renderSidebar();
    generateTOC();
    setupEffects();
    setupEventHandlers();
    setupScrollSpy();
    {{IMAGE_RESTORATION}}
    initImageViewer();

    var hash = location.hash.replace(/^#/, '');
    if (hash) {
        var target = el('#page-' + hash);
        if (target) {
            state.currentPage.value = hash;
            history.replaceState({ slug: hash, index: 0 }, '', '#' + hash);
            scrollToTop();
        }
    }
}

function initTheme() {
    const savedTheme = document.documentElement.getAttribute('data-theme');
    setTheme(savedTheme || state.currentTheme.value);
    updateThemeIcon();
}

function updateThemeIcon() {
    const sun = el('#theme-icon-sun');
    const moon = el('#theme-icon-moon');
    const isDark = getTheme() === 'dark';
    if (sun) sun.style.display = isDark ? 'block' : 'none';
    if (moon) moon.style.display = isDark ? 'none' : 'block';
}

function renderSidebar() {
    const list = el('#wiki-page-list');
    if (!list) return;

    const notes = computedState.filteredNotes.value;
    list.innerHTML = notes.map(note => ''
        + '<li>'
        + '<a href="javascript:void(0)" data-page="' + note.slug + '">'
        + note.title
        + '</a>'
        + '</li>'
    ).join('');
}

function generateTOC() {
    const tocBody = el('#wiki-inline-toc-body');
    if (!tocBody) return;

    tocBody.innerHTML = '';

    var slug = state.currentPage.value;
    var activePage = el('#page-' + slug);
    if (!activePage) return;

    var headings = activePage.querySelectorAll('h2, h3');
    if (!headings || headings.length === 0) return;

    var tocHTML = '<ul id="page-toc-list">';

    headings.forEach(function(heading) {
        var id = heading.id;
        if (!id) return;
        var text = (heading.textContent || '').trim();
        var level = heading.tagName.toLowerCase();
        tocHTML += '<li><a href="#' + id + '" class="' + level + '" data-target="' + id + '">' + text + '</a></li>';
    });

    tocHTML += '</ul>';

    tocBody.innerHTML = tocHTML;

    tocBody.querySelectorAll('a').forEach(function(a) {
        a.addEventListener('click', function(e) {
            e.preventDefault();
            var href = a.getAttribute('href');
            if (href) scrollToId(href.substring(1));
        });
    });
}

function toggleTOC() {
    const toc = el('#wiki-inline-toc');
    const layout = el('#wiki-body-layout');
    const toggleBtn = el('#toc-toggle');
    if (!toc || !layout || !toggleBtn) return;

    state.tocCollapsed.value = !state.tocCollapsed.value;
    const isCollapsed = state.tocCollapsed.value;

    if (isCollapsed) {
        toc.classList.add('collapsed');
        layout.classList.add('toc-collapsed');
        toggleBtn.setAttribute('aria-expanded', 'false');
    } else {
        toc.classList.remove('collapsed');
        layout.classList.remove('toc-collapsed');
        toggleBtn.setAttribute('aria-expanded', 'true');
    }
}

function setupScrollSpy() {
    if (scrollSpyObserver) {
        scrollSpyObserver.disconnect();
    }

    var slug = state.currentPage.value;
    var activePage = el('#page-' + slug);
    if (!activePage) return;

    var headings = activePage.querySelectorAll('h2, h3');
    if (!headings || headings.length === 0) return;

    scrollSpyObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                var id = entry.target.id;
                var tocBody = el('#wiki-inline-toc-body');
                if (tocBody) {
                    tocBody.querySelectorAll('a').forEach(function(link) {
                        if (link.classList) {
                            if (link.dataset.target === id) {
                                link.classList.add('active');
                            } else {
                                link.classList.remove('active');
                            }
                        }
                    });
                }
            }
        });
    }, { root: null, rootMargin: '-15% 0px -75% 0px', threshold: 0 });

    headings.forEach(function(h) { if (h.id) scrollSpyObserver.observe(h); });
}

function setupEffects() {
    effect(() => {
        const slug = state.currentPage.value;
        els('.wiki-page').forEach(p => {
            if (p.classList) {
                if (p.id === 'page-' + slug) {
                    p.classList.add('active');
                } else {
                    p.classList.remove('active');
                }
            }
        });
        generateTOC();
        setupScrollSpy();
    });

    effect(() => {
        const bc = el('#wiki-breadcrumb');
        const currentNote = state.notes.find(n => n.slug === state.currentPage.value);
        if (bc) {
            bc.innerHTML = currentNote
                ? '<a href="javascript:void(0)" data-page="' + currentNote.slug + '">' + currentNote.title + '</a>'
                : '';
        }
    });

    effect(() => {
        const backBtn = el('#wiki-back');
        const forwardBtn = el('#wiki-forward');
        if (backBtn) backBtn.disabled = !computedState.canGoBack.value;
        if (forwardBtn) forwardBtn.disabled = !computedState.canGoForward.value;
    });

    effect(() => {
        const sidebar = el('#wiki-sidebar');
        const main = el('#wiki-main');
        const isCollapsed = state.sidebarCollapsed.value;

        if (sidebar) {
            if (isCollapsed) {
                sidebar.classList.add('collapsed');
            } else {
                sidebar.classList.remove('collapsed');
            }
        }
        if (main) {
            if (isCollapsed) {
                main.classList.add('sidebar-collapsed');
            } else {
                main.classList.remove('sidebar-collapsed');
            }
        }
    });

    effect(() => {
        const slug = state.currentPage.value;
        els('#wiki-page-list a').forEach(a => {
            if (a.classList) {
                if (a.dataset.page === slug) {
                    a.classList.add('active');
                } else {
                    a.classList.remove('active');
                }
            }
        });
    });

    effect(() => {
        renderSidebar();
    });
}

function setupEventHandlers() {
    const sidebarToggleBtn = el('#wiki-sidebar-toggle');
    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', () => {
            state.sidebarCollapsed.value = !state.sidebarCollapsed.value;
        });
    }

    const tocToggleBtn = el('#toc-toggle');
    if (tocToggleBtn) {
        tocToggleBtn.addEventListener('click', toggleTOC);
    }

    const themeToggleBtn = el('#theme-toggle');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            toggleTheme();
            updateThemeIcon();
        });
    }

    const backBtn = el('#wiki-back');
    if (backBtn) {
        backBtn.addEventListener('click', goBack);
    }

    const forwardBtn = el('#wiki-forward');
    if (forwardBtn) {
        forwardBtn.addEventListener('click', goForward);
    }

    const searchInput = el('#wiki-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.searchQuery.value = e.target.value;
        });
    }

    const pageList = el('#wiki-page-list');
    if (pageList) {
        pageList.addEventListener('click', (e) => {
            if (e.target.tagName === 'A') {
                e.preventDefault();
                const page = e.target.dataset.page;
                if (page) showPage(page);
            }
        });
    }

    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[data-page]');
        if (link) {
            e.preventDefault();
            const page = link.dataset.page;
            if (page) showPage(page);
        }
    });

    window.addEventListener('popstate', function(e) {
        if (e.state && e.state.slug) {
            var slug = e.state.slug;
            var index = e.state.index || 0;
            closeImage();
            state._historyIndex.value = index;
            state.currentPage.value = slug;
        }
    });
}

function showPage(slug) {
    closeImage();
    var target = el('#page-' + slug);
    if (!target) return;

    var previousSlug = state.currentPage.value;
    if (previousSlug === slug) return;

    var h = state._history.value;
    var idx = state._historyIndex.value;
    h = h.slice(0, idx + 1);
    h.push(slug);
    idx = h.length - 1;
    state._history.value = h;
    state._historyIndex.value = idx;
    state.currentPage.value = slug;
    history.pushState({ slug: slug, index: idx }, '', '#' + slug);
    scrollToTop();
}

function goBack() {
    window.history.back();
}

function goForward() {
    window.history.forward();
}

// =========================================================================
// Image Viewer (lightbox with zoom/pan)
// =========================================================================

var ivOpen = false, ivScale = 1, ivX = 0, ivY = 0;
var ivDrag = false, ivDSX = 0, ivDSY = 0, ivIX = 0, ivIY = 0;
var ivEl = null;

function initImageViewer() {
  if (ivEl) return;
  ivEl = document.createElement('div');
  ivEl.id = 'iv';
  ivEl.innerHTML = '<div id="iv-b"></div><img id="iv-i" draggable="false"><div id="iv-t"><button data-a="in">+</button><button data-a="out">−</button><button data-a="rst">↺</button><button data-a="cls">✕</button></div>';
  document.body.appendChild(ivEl);

  function ivSrc(el) {
    if (el.tagName === 'IMG') return el.getAttribute('src') || '';
    var svg = el.cloneNode(true);
    if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
  }

  document.addEventListener('click', function(e) {
    var media = e.target.closest('.wiki-page.active img, .wiki-page.active svg');
    if (!media || ivOpen) return;
    e.preventDefault();
    ivOpen = true; ivScale = 1; ivX = 0; ivY = 0;
    ivEl.querySelector('#iv-i').src = ivSrc(media);
    ivEl.style.display = 'flex';
    ivUpdate();
    document.body.style.overflow = 'hidden';
  });

  ivEl.addEventListener('click', function(e) {
    if (e.target === ivEl || e.target.id === 'iv-b') closeImage();
  });

  ivEl.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-a]');
    if (!btn) return;
    switch (btn.dataset.a) {
      case 'cls': closeImage(); break;
      case 'in': ivZoom(ivScale * 1.4); break;
      case 'out': ivZoom(ivScale / 1.4); break;
      case 'rst': ivScale = 1; ivX = 0; ivY = 0; ivUpdate(); break;
    }
  });

  ivEl.addEventListener('wheel', function(e) {
    if (!ivOpen) return;
    e.preventDefault();
    ivZoom(ivScale * (e.deltaY > 0 ? 0.9 : 1.1), e.clientX, e.clientY);
  }, { passive: false });

  ivEl.addEventListener('mousedown', function(e) {
    if (!ivOpen || !e.target.closest('#iv-i')) return;
    ivDrag = true; ivDSX = e.clientX; ivDSY = e.clientY;
    ivIX = ivX; ivIY = ivY;
    e.target.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', function(e) {
    if (!ivDrag) return;
    ivX = ivIX + e.clientX - ivDSX;
    ivY = ivIY + e.clientY - ivDSY;
    ivUpdate();
  });

  document.addEventListener('mouseup', function() {
    if (!ivDrag) return;
    ivDrag = false;
    var img = ivEl && ivEl.querySelector('#iv-i');
    if (img) img.style.cursor = '';
  });

  ivEl.addEventListener('touchstart', function(e) {
    if (!ivOpen || e.touches.length !== 1 || !e.target.closest('#iv-i')) return;
    ivDrag = true;
    ivDSX = e.touches[0].clientX; ivDSY = e.touches[0].clientY;
    ivIX = ivX; ivIY = ivY;
  }, { passive: true });

  ivEl.addEventListener('touchmove', function(e) {
    if (!ivDrag || e.touches.length !== 1) return;
    ivX = ivIX + e.touches[0].clientX - ivDSX;
    ivY = ivIY + e.touches[0].clientY - ivDSY;
    ivUpdate();
  }, { passive: true });

  ivEl.addEventListener('touchend', function() { ivDrag = false; }, { passive: true });

  document.addEventListener('keydown', function(e) {
    if (!ivOpen) return;
    switch (e.key) {
      case 'Escape': closeImage(); break;
      case '+': case '=': ivZoom(ivScale * 1.4); break;
      case '-': ivZoom(ivScale / 1.4); break;
      case '0': ivScale = 1; ivX = 0; ivY = 0; ivUpdate(); break;
    }
  });
}

function closeImage() {
  if (!ivOpen) return;
  ivOpen = false;
  if (ivEl) ivEl.style.display = 'none';
  document.body.style.overflow = '';
}

function ivZoom(ns, cx, cy) {
  ns = Math.max(0.1, Math.min(20, ns));
  if (cx !== undefined) {
    var vpw = window.innerWidth, vph = window.innerHeight;
    var r = ns / ivScale;
    ivX = (cx - vpw / 2) * (1 - r) + ivX * r;
    ivY = (cy - vph / 2) * (1 - r) + ivY * r;
  }
  ivScale = ns;
  ivUpdate();
}

function ivUpdate() {
  var img = ivEl && ivEl.querySelector('#iv-i');
  if (img) img.style.transform = 'translate(-50%,-50%) translate(' + ivX + 'px,' + ivY + 'px) scale(' + ivScale + ')';
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWiki);
} else {
    initWiki();
}
