/** @file A horizontal strip of CATEGORY tabs — the outer level of each panel's tabs-within-tabs structure (chat / explorer / review …), built ready for future categories like a terminal. */

/**
 * Build a category-tab strip element (a row of category tabs).
 * @param {Array} categories - Category descriptors `[{ id, label, icon }]` (icon = a bootstrap-icons class).
 * @param {string} activeId - The id of the active category.
 * @returns {HTMLElement} The strip element (carries `[data-slot="category-tabs"]`; each tab carries `[data-slot="category-tab"][data-category-id]`).
 */
export function CategoryTabStrip(categories, activeId) {
  const strip = document.createElement("div");
  strip.dataset.slot = "category-tabs";
  strip.className = "d-flex align-items-stretch border-bottom overflow-x-auto bg-body-tertiary shrink-0";
  strip.style.minHeight = "28px";
  strip.replaceChildren(...categories.map(c => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.dataset.slot = "category-tab";
    tab.dataset.categoryId = c.id;
    const active = c.id === activeId;
    tab.dataset.active = active ? "true" : "false";
    tab.className = "btn btn-sm btn-link d-flex align-items-center gap-1 px-2 text-decoration-none small shrink-0 " + (active ? "text-body fw-medium" : "text-secondary");
    tab.style.borderBottom = active ? "2px solid var(--bs-primary)" : "2px solid transparent";
    tab.innerHTML = `<i class="bi ${c.icon}"></i><span>${c.label}</span>`;
    return tab;
  }));
  return strip;
}
