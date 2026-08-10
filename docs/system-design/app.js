function normalizeForSearch(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function getMatchingSectionIds(query, sections) {
  const normalizedQuery = normalizeForSearch(query);

  if (!normalizedQuery) {
    return sections.map(({ id }) => id);
  }

  return sections
    .filter(({ text }) => normalizeForSearch(text).includes(normalizedQuery))
    .map(({ id }) => id);
}

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function setTheme(theme, root, button, themeColor) {
  const isDark = theme === "dark";
  root.dataset.theme = theme;
  button.setAttribute("aria-pressed", String(isDark));
  button.querySelector(".button-label").textContent = isDark ? "Tema claro" : "Tema escuro";
  themeColor.setAttribute("content", isDark ? "#101d26" : "#eef4f7");
}

function initTheme() {
  const root = document.documentElement;
  const button = document.querySelector("#theme-toggle");
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const storage = safeStorage();
  const savedTheme = storage?.getItem("system-design-theme");
  const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";

  setTheme(savedTheme ?? preferredTheme, root, button, themeColor);

  button.addEventListener("click", () => {
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    setTheme(nextTheme, root, button, themeColor);
    storage?.setItem("system-design-theme", nextTheme);
  });
}

function updateSearchUrl(query) {
  const url = new URL(window.location.href);

  if (query) {
    url.searchParams.set("q", query);
  } else {
    url.searchParams.delete("q");
  }

  window.history.replaceState({}, "", url);
}

function initSectionSearch() {
  const input = document.querySelector("#section-search");
  const status = document.querySelector("#search-status");
  const emptyState = document.querySelector("#empty-search");
  const clearButton = document.querySelector("#clear-search");
  const sections = [...document.querySelectorAll(".document-section")];
  const sectionIndex = sections.map((section) => ({
    id: section.id,
    text: `${section.dataset.search ?? ""} ${section.textContent}`,
  }));

  function applySearch(rawQuery, { updateUrl = true } = {}) {
    const query = rawQuery.trim();
    const matches = new Set(getMatchingSectionIds(query, sectionIndex));

    for (const section of sections) {
      section.hidden = !matches.has(section.id);
    }

    for (const link of document.querySelectorAll(".section-nav a")) {
      link.hidden = !matches.has(link.hash.slice(1));
    }

    const count = matches.size;
    status.textContent = query
      ? `${count} ${count === 1 ? "seção encontrada" : "seções encontradas"}`
      : "";
    emptyState.hidden = count > 0;

    if (updateUrl) {
      updateSearchUrl(query);
    }
  }

  const initialQuery = new URL(window.location.href).searchParams.get("q") ?? "";
  input.value = initialQuery;
  applySearch(initialQuery, { updateUrl: false });

  input.addEventListener("input", () => applySearch(input.value));
  clearButton.addEventListener("click", () => {
    input.value = "";
    applySearch("");
    input.focus();
  });
}

function initActiveNavigation() {
  if (!("IntersectionObserver" in window)) {
    return;
  }

  const links = new Map(
    [...document.querySelectorAll(".section-nav a")].map((link) => [
      link.hash.slice(1),
      link,
    ]),
  );

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting && !entry.target.hidden)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visible) {
        return;
      }

      for (const link of links.values()) {
        link.removeAttribute("aria-current");
      }
      links.get(visible.target.id)?.setAttribute("aria-current", "location");
    },
    { rootMargin: "-20% 0px -70% 0px", threshold: [0, 0.1, 0.5] },
  );

  document.querySelectorAll(".document-section").forEach((section) => observer.observe(section));
}

function init() {
  initTheme();
  initSectionSearch();
  initActiveNavigation();
  document.querySelector("#print-design").addEventListener("click", () => window.print());
}

globalThis.SystemDesign = { getMatchingSectionIds, normalizeForSearch };

if (typeof document !== "undefined") {
  init();
}
