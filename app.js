// Snowflake x Sifted Bellevue - day-first menu renderer.

const DATA_URL = "./data/menu.json";

const SHORT_DAY = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

// Ingredient text contains a meat/seafood signal -> not vegetarian.
const NON_VEG = /\b(chicken|beef|pork|lamb|bacon|ham|turkey|duck|sausage|prosciutto|pancetta|chorizo|pepperoni|salami|fish|shrimp|prawn|salmon|tuna|cod|halibut|crab|lobster|scallop|mussel|clam|oyster|squid|octopus|anchov|gelatin|veal)\b/i;

// Ingredient text or allergens that imply gluten.
const GLUTEN_KEYWORDS = /\b(wheat|flour|bread|panko|pasta|noodle|naan|tortilla|wrap|bun|pita|cracker|breadcrumb|barley|rye|seitan|soy sauce|tempura|cous ?cous|farro|bulgur)\b/i;

const dayNavEl = document.getElementById("day-nav");
const menuEl = document.getElementById("menu");
const weekLabelEl = document.getElementById("week-label");
const surveyLinkEl = document.getElementById("survey-link");
const generatedAtEl = document.getElementById("generated-at");

function escape(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function titleCase(str) {
  if (!str) return str;
  return str
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/(^|\s)N'/gi, (_, s) => `${s}n'`);
}

function shortDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function pickDefaultDayIndex(days) {
  const todayName = new Date().toLocaleDateString(undefined, {
    weekday: "long",
  });
  const idx = days.findIndex((d) => d.day === todayName);
  return idx >= 0 ? idx : 0;
}

function dietaryTags(dish) {
  const text = `${dish.title || ""} ${dish.description || ""}`;
  const allergens = (dish.allergens || []).map((a) => a.toLowerCase());
  const tags = [];
  if (!NON_VEG.test(text)) tags.push("VEG");
  const hasWheatAllergen = allergens.includes("wheat") || allergens.includes("gluten");
  if (!hasWheatAllergen && !GLUTEN_KEYWORDS.test(text)) tags.push("GF");
  return tags;
}

function renderTags(tags) {
  if (!tags || tags.length === 0) return "";
  const pills = tags
    .map((t) => {
      const cls = t === "VEG" ? "tag tag--veg" : t === "GF" ? "tag tag--gf" : "tag";
      return `<span class="${cls}">${escape(t)}</span>`;
    })
    .join("");
  return `<div class="dish__tags">${pills}</div>`;
}

function renderDish(dish) {
  return `
    <li class="dish">
      <p class="dish__title">${escape(titleCase(dish.title))}</p>
      ${renderTags(dietaryTags(dish))}
    </li>
  `;
}

function renderStation(station, sourceUrl, isLastCentered) {
  const sourceLink = sourceUrl
    ? `<a class="station__source" href="${escape(sourceUrl)}" target="_blank" rel="noopener" aria-label="${escape(station.name)} on Sifted">View on Sifted &rarr;</a>`
    : "";

  const head = `
    <header class="station__head">
      <div class="station__heading">
        <h3 class="station__name">${escape(station.name)}</h3>
        ${station.tagline ? `<p class="station__tagline">${escape(station.tagline)}</p>` : ""}
      </div>
      ${sourceLink}
    </header>
  `;

  const dishes = station.dishes && station.dishes.length
    ? `<ul class="dishes">${station.dishes.map(renderDish).join("")}</ul>`
    : `<p class="station__empty">Menu coming soon.</p>`;

  const cls = isLastCentered ? "station station--last-centered" : "station";
  return `
    <section class="${cls}" id="station-${escape(station.id)}">
      ${head}
      ${dishes}
    </section>
  `;
}

function renderDay(day, sourcesById) {
  const isOdd = day.stations.length % 2 === 1;
  const stations = day.stations
    .map((s, i) =>
      renderStation(s, sourcesById.get(s.id), isOdd && i === day.stations.length - 1),
    )
    .join("");

  return `
    <header class="day-header">
      <p class="day-header__eyebrow">Today's Service</p>
      <h2 class="day-header__day">${escape(day.day)}</h2>
      <p class="day-header__date">${escape(day.date)}</p>
    </header>
    <div class="stations-card">
      <div class="stations-grid">${stations}</div>
    </div>
  `;
}

function renderDayNav(days, activeIdx) {
  dayNavEl.innerHTML = days
    .map((d, i) => {
      const selected = i === activeIdx ? "true" : "false";
      return `
        <button
          class="day-tab"
          role="tab"
          aria-selected="${selected}"
          data-index="${i}"
        >
          <span>${escape(SHORT_DAY[d.day] ?? d.day)}</span>
          <span class="day-tab__date">${escape(shortDate(d.date))}</span>
        </button>
      `;
    })
    .join("");
}

function setActive(days, idx, sourcesById) {
  for (const btn of dayNavEl.querySelectorAll(".day-tab")) {
    btn.setAttribute(
      "aria-selected",
      Number(btn.dataset.index) === idx ? "true" : "false",
    );
  }
  menuEl.innerHTML = renderDay(days[idx], sourcesById);
  if (history.replaceState) {
    history.replaceState(null, "", `#${days[idx].day.toLowerCase()}`);
  }
}

function indexFromHash(days) {
  const hash = window.location.hash.replace("#", "").toLowerCase();
  if (!hash) return -1;
  return days.findIndex((d) => d.day.toLowerCase() === hash);
}

async function main() {
  let data;
  try {
    const res = await fetch(DATA_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    menuEl.innerHTML = `<p class="loading">Could not load this week's menu (${escape(err.message)}).</p>`;
    return;
  }

  weekLabelEl.textContent = data.weekLabel || "This week";
  surveyLinkEl.href = data.surveyUrl;
  if (data.generatedAt) {
    const d = new Date(data.generatedAt);
    generatedAtEl.dateTime = data.generatedAt;
    generatedAtEl.textContent = d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const days = data.days || [];
  if (days.length === 0) {
    menuEl.innerHTML = `<p class="loading">No menu available this week.</p>`;
    return;
  }

  const sourcesById = new Map((data.sources || []).map((s) => [s.id, s.url]));

  const initial =
    indexFromHash(days) >= 0 ? indexFromHash(days) : pickDefaultDayIndex(days);
  renderDayNav(days, initial);
  setActive(days, initial, sourcesById);

  // Tab clicks update the panel in place — no scroll, no jump.
  dayNavEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".day-tab");
    if (!btn) return;
    setActive(days, Number(btn.dataset.index), sourcesById);
  });

  window.addEventListener("hashchange", () => {
    const idx = indexFromHash(days);
    if (idx >= 0) setActive(days, idx, sourcesById);
  });
}

main();
