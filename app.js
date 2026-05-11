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

function renderAllergens(allergens, className = "dish__allergens") {
  if (!allergens || allergens.length === 0) return "";
  const pills = allergens
    .map((a) => `<span class="allergen">${escape(a)}</span>`)
    .join("");
  return `<div class="${className}">${pills}</div>`;
}

function renderDish(dish) {
  return `
    <li class="dish">
      <div class="dish__head">
        <h4 class="dish__title">${escape(titleCase(dish.title))}</h4>
        <span class="dish__leader" aria-hidden="true"></span>
        ${renderAllergens(dish.allergens)}
      </div>
      ${
        dish.description
          ? `<p class="dish__description">${escape(dish.description)}</p>`
          : ""
      }
    </li>
  `;
}

function renderStation(station) {
  const hasContent =
    station.hero || (station.dishes && station.dishes.length > 0);
  if (!hasContent) {
    return `
      <section class="station">
        <header class="station__head">
          <h3 class="station__name">${escape(station.name)}</h3>
          ${station.tagline ? `<p class="station__tagline">${escape(station.tagline)}</p>` : ""}
        </header>
        <p class="station__empty">Menu coming soon.</p>
      </section>
    `;
  }
  const hero = station.hero
    ? `<p class="station__hero">${escape(titleCase(station.hero))}</p>`
    : "";
  const heroAllergens = renderAllergens(
    station.heroAllergens,
    "station__hero-allergens",
  );
  const dishes =
    station.dishes && station.dishes.length
      ? `<ul class="dishes">${station.dishes.map(renderDish).join("")}</ul>`
      : "";
  return `
    <section class="station" id="station-${escape(station.id)}">
      <header class="station__head">
        <h3 class="station__name">${escape(station.name)}</h3>
        ${station.tagline ? `<p class="station__tagline">${escape(station.tagline)}</p>` : ""}
      </header>
      ${hero}
      ${heroAllergens}
      ${dishes}
    </section>
  `;
}

function renderDay(day) {
  const stations = day.stations.map(renderStation).join("");
  return `
    <article class="day-panel" role="tabpanel">
      <header class="day-header">
        <p class="day-header__eyebrow">Today's Service</p>
        <h2 class="day-header__day">${escape(day.day)}</h2>
        <p class="day-header__date">${escape(day.date)}</p>
      </header>
      ${stations}
    </article>
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

function setActive(days, idx) {
  for (const btn of dayNavEl.querySelectorAll(".day-tab")) {
    btn.setAttribute(
      "aria-selected",
      Number(btn.dataset.index) === idx ? "true" : "false",
    );
  }
  menuEl.innerHTML = renderDay(days[idx]);
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

  const initial =
    indexFromHash(days) >= 0 ? indexFromHash(days) : pickDefaultDayIndex(days);
  renderDayNav(days, initial);
  setActive(days, initial);

  dayNavEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".day-tab");
    if (!btn) return;
    setActive(days, Number(btn.dataset.index));
    menuEl.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  window.addEventListener("hashchange", () => {
    const idx = indexFromHash(days);
    if (idx >= 0) setActive(days, idx);
  });
}

main();
