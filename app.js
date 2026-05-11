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

const TAG_LABELS = { VEG: "V", GF: "GF" };

function renderTags(tags) {
  if (!tags || tags.length === 0) return "";
  const pills = tags
    .map((t) => {
      const cls = t === "VEG" ? "tag tag--veg" : t === "GF" ? "tag tag--gf" : "tag";
      const label = TAG_LABELS[t] ?? t;
      return `<span class="${cls}" aria-label="${escape(t === "VEG" ? "Vegetarian" : t === "GF" ? "Gluten free" : t)}">${escape(label)}</span>`;
    })
    .join("");
  return `<span class="dish__tags">${pills}</span>`;
}

function renderDish(dish, { showTags = true } = {}) {
  const desc = (dish.description || "").trim();
  const tags = showTags ? renderTags(dietaryTags(dish)) : "";
  const tipAttrs = desc
    ? ` data-has-tip="true" tabindex="0"`
    : "";
  const tip = desc
    ? `<span class="dish__tip" role="tooltip">${escape(desc)}</span>`
    : "";
  return `
    <li class="dish"${tipAttrs}>
      <p class="dish__title">${escape(titleCase(dish.title))}</p>
      ${tags}
      ${tip}
    </li>
  `;
}

function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Tiny Levenshtein implementation; tolerates the typos that show up in
// Sifted's hand-edited menus (e.g. "Mediteranean" vs "Mediterranean").
function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr.push(Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost));
    }
    prev = curr;
  }
  return prev[b.length];
}

function looksLikeHero(heroNorm, dishNorm) {
  if (!heroNorm || !dishNorm) return false;
  if (heroNorm === dishNorm) return true;
  if (heroNorm.includes(dishNorm) || dishNorm.includes(heroNorm)) return true;
  // Allow ~10% character difference (rounded up) to absorb typos.
  const maxLen = Math.max(heroNorm.length, dishNorm.length);
  const threshold = Math.max(2, Math.ceil(maxLen * 0.1));
  return editDistance(heroNorm, dishNorm) <= threshold;
}

// --- Wrap Culture salad-bar categorization -------------------------------
// Sifted doesn't tag toppings with categories, so we use simple keyword
// heuristics on the dish title to split the bar into two columns:
//   Left  = proteins, cheeses, dressings, croutons, featured salads
//   Right = vegetables and fruit
// Use word-start boundary only (no trailing \b) so plurals and inflections
// match: "onion" hits "onions", "pickle" hits "pickled", etc.
const DRESSING_KW = /\b(dressing|vinaigrette|sauce|aioli|pesto|mayo|yogurt|tahini|hummus)/i;
const PROTEIN_KW = /\b(chicken|turkey|beef|pork|ham|bacon|sausage|fish|salmon|tuna|shrimp|tofu|seitan|tempeh|bean|chickpea|lentil|edamame|egg|cheese|feta|mozzarella|parmesan|paneer|halloumi|queso|jack|brie|crouton|tortilla|wrap)/i;
const VEG_KW = /\b(romaine|lettuce|spinach|kale|arugula|mix|green|broccoli|cauliflower|cabbage|slaw|sprout|carrot|cucumber|tomato|onion|scallion|chive|pepper|bell|jalapeno|jalapeño|pepperoncini|pickle|radish|beet|celery|mushroom|corn|pea|zucchini|squash|asparagus|eggplant|potato|fennel|grape|berry|apple|pear|orange|pomegranate|raisin|cranberry|fruit|cherry)/i;

function categorizeSaladItem(dish) {
  const t = (dish.title || "").toLowerCase();
  if (DRESSING_KW.test(t)) return "left";
  if (PROTEIN_KW.test(t)) return "left";
  if (VEG_KW.test(t)) return "right";
  return "left";
}

function reorderDishes(station) {
  const hero = normalizeName(station.hero);
  if (!hero) return station.dishes || [];
  const dishes = [...(station.dishes || [])];
  const idx = dishes.findIndex((d) => looksLikeHero(hero, normalizeName(d.title)));
  if (idx > 0) {
    const [match] = dishes.splice(idx, 1);
    dishes.unshift(match);
  }
  return dishes;
}

function renderStation(station, sourceUrl, isLastCentered) {
  const isSaladBar = station.id === "wrap-culture";

  const nameInner = sourceUrl
    ? `<a href="${escape(sourceUrl)}" target="_blank" rel="noopener">${escape(station.name)}</a>`
    : escape(station.name);

  const head = `
    <header class="station__head">
      <h3 class="station__name">${nameInner}</h3>
      ${station.tagline ? `<p class="station__tagline">${escape(station.tagline)}</p>` : ""}
    </header>
  `;

  const orderedDishes = reorderDishes(station);
  let dishes;
  if (station.inService === false) {
    dishes = `<p class="station__empty">Not in service today</p>`;
  } else if (!orderedDishes.length) {
    dishes = `<p class="station__empty">Menu coming soon.</p>`;
  } else if (isSaladBar) {
    const left = orderedDishes.filter((d) => categorizeSaladItem(d) === "left");
    const right = orderedDishes.filter((d) => categorizeSaladItem(d) === "right");
    const renderCol = (heading, items) =>
      items.length
        ? `<div>
             <h4 class="saladbar-col__heading">${escape(heading)}</h4>
             <ul class="saladbar-col__list">${items
               .map((d) => renderDish(d, { showTags: false }))
               .join("")}</ul>
           </div>`
        : "";
    dishes = `<div class="dishes">${renderCol("Proteins & Toppings", left)}${renderCol("Vegetables", right)}</div>`;
  } else {
    dishes = `<ul class="dishes">${orderedDishes
      .map((d) => renderDish(d, { showTags: true }))
      .join("")}</ul>`;
  }

  const cls = [
    "station",
    isLastCentered ? "station--last-centered" : "",
    isSaladBar && station.inService !== false ? "station--saladbar" : "",
    station.id === "wrap-culture" ? "station--full-row" : "",
    station.id === "sweet-spot" ? "station--narrow" : "",
    station.inService === false ? "station--off" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `
    <section class="${cls}" id="station-${escape(station.id)}">
      ${head}
      ${dishes}
    </section>
  `;
}

function renderDay(day, sourcesById) {
  // Wrap Culture and Sweet Spot always get their own row at the bottom
  // of the menu, regardless of how many other stations are present.
  const ALWAYS_OWN_ROW = new Set(["wrap-culture", "sweet-spot"]);
  const regulars = day.stations.filter((s) => !ALWAYS_OWN_ROW.has(s.id));
  const specials = day.stations.filter((s) => ALWAYS_OWN_ROW.has(s.id));
  const ordered = [...regulars, ...specials];
  const regularsAreOdd = regulars.length % 2 === 1;

  const stations = ordered
    .map((s, i) => {
      const isLastRegular = regularsAreOdd && i === regulars.length - 1;
      return renderStation(s, sourcesById.get(s.id), isLastRegular);
    })
    .join("");

  return `
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

  // Touch devices only: tap-to-toggle the tooltip. We use pointerdown so
  // we know the pointer type and avoid leaving the .is-open class
  // hanging around on a mouse-driven device after the cursor moves away.
  const isHoverDevice = window.matchMedia("(hover: hover)").matches;
  document.addEventListener("pointerdown", (e) => {
    if (isHoverDevice && e.pointerType === "mouse") return;
    const dish = e.target.closest(".dish[data-has-tip='true']");
    document.querySelectorAll(".dish.is-open").forEach((d) => {
      if (d !== dish) d.classList.remove("is-open");
    });
    if (dish) dish.classList.toggle("is-open");
  });

  // Belt-and-suspenders: if the pointer leaves an open dish (e.g. it was
  // toggled open via keyboard or stale tap), clear the open state so the
  // tooltip doesn't get stuck.
  document.addEventListener(
    "pointerleave",
    (e) => {
      const dish = e.target.closest?.(".dish.is-open");
      if (dish) dish.classList.remove("is-open");
    },
    true,
  );

  window.addEventListener("hashchange", () => {
    const idx = indexFromHash(days);
    if (idx >= 0) setActive(days, idx, sourcesById);
  });
}

main();
