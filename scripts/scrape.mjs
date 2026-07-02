#!/usr/bin/env node
// Fetches Bellevue lunch + breakfast menus from the Sifted portal API and writes
// data/menu.json grouped by day (all stations for each day).

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const STATIONS = [
  { id: "pure", name: "Pure", url: "https://eat.sifted.co/meals/659a82e0-6f43-432e-acf9-af733a7e1ef6", tagline: "Clean, vibrant, plant-forward" },
  { id: "rotating-plate", name: "Rotating Plate", url: "https://eat.sifted.co/meals/cdc9288e-8e59-43d9-a69d-404b8a936039", tagline: "A new chef's special every day" },
  { id: "wok-n-tandoor", name: "Wok N' Tandoor", url: "https://eat.sifted.co/meals/7b143ea2-0e69-4a54-95ff-e07383ee664d", tagline: "Asian wok and Indian tandoor classics" },
  { id: "hot-hands", name: "Hot Hands", url: "https://eat.sifted.co/meals/b507148b-aead-4e34-9542-828494b6bbc3", tagline: "Sandwiches, pizzas, and other handhelds" },
  { id: "wrap-culture", name: "Wrap Culture", url: "https://eat.sifted.co/meals/15b2a5bb-da9f-43a9-808e-ffeb47ca040a", tagline: "Hand-rolled wraps from around the globe" },
  { id: "sweet-spot", name: "Sweet Spot", url: "https://eat.sifted.co/meals/e9699fc9-3bc1-4d04-be64-68ae4865b39a", tagline: "A little something sweet to finish" },
];

const STATION_BY_ID = new Map(STATIONS.map((s) => [s.id, s]));
const STATION_ORDER = STATIONS.map((s) => s.id);

const BELLEVUE_MARKET_URL = "https://snowflake.sifted.co/api/markets/snowflake/bellevue";
const BELLEVUE_MEALS_URL = "https://snowflake.sifted.co/api/markets/meals";
const BREAKFAST_SOURCE_URL = "https://snowflake.sifted.co/bellevue/meals";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const HOT_BREAKFAST_BRANDS = new Set(["Hot Hands", "Hot Breakfast"]);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_PATH = resolve(ROOT, "data", "menu.json");

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) sifted-menu-scraper/2.0",
      accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

function normalizeBrand(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STATION_ID_BY_BRAND = new Map(
  [
    ["pure", "pure"],
    ["rotating plate", "rotating-plate"],
    ["wok n tandoor", "wok-n-tandoor"],
    ["hot hands", "hot-hands"],
    ["wrap culture", "wrap-culture"],
    ["sweet spot", "sweet-spot"],
  ],
);

function stationIdForBrand(brandName) {
  return STATION_ID_BY_BRAND.get(normalizeBrand(brandName)) ?? null;
}

function isoDateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatMenuDate(date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function mondayOfWeek(ref = new Date()) {
  const d = new Date(ref);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return d;
}

export function weekLabelForDate(ref = new Date()) {
  const monday = mondayOfWeek(ref);
  const day = monday.getDate();
  const month = monday.toLocaleDateString("en-GB", { month: "long" });
  return `Week of ${day} ${month}`;
}

function weekdayDatesForWeek(ref = new Date()) {
  const monday = mondayOfWeek(ref);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function emptyBreakfast() {
  return {
    inService: false,
    name: "Hot Hands",
    tagline: "Breakfast",
    hero: "",
    dishes: [],
    sourceUrl: BREAKFAST_SOURCE_URL,
  };
}

function dishesFromElements(elements) {
  return (elements ?? [])
    .map((el) => ({
      title: (el.name ?? "").trim(),
      description: (el.ingredients ?? "").trim(),
      allergens: [...new Set((el.allergens ?? []).filter(Boolean))],
    }))
    .filter((d) => d.title);
}

function stationFromMenu(menu, meta) {
  return {
    id: meta.id,
    name: meta.name,
    tagline: meta.tagline,
    hero: (menu.name ?? "").trim(),
    heroAllergens: [],
    dishes: dishesFromElements(menu.scheduledElements),
    inService: true,
  };
}

function offServiceStation(meta) {
  return {
    id: meta.id,
    name: meta.name,
    tagline: meta.tagline,
    hero: "",
    heroAllergens: [],
    dishes: [],
    inService: false,
  };
}

async function getBellevueMarketId() {
  const { data } = await fetchJson(BELLEVUE_MARKET_URL);
  if (!data?.id) throw new Error("Bellevue market id missing from API response");
  return data.id;
}

async function fetchMealsForDate(marketId, isoDate) {
  const url = `${BELLEVUE_MEALS_URL}?id=${encodeURIComponent(marketId)}&date=${encodeURIComponent(isoDate)}`;
  const { data } = await fetchJson(url);
  return data ?? [];
}

function breakfastFromPayload(payload) {
  for (const item of payload) {
    if (item.serviceLine?.name?.toLowerCase() !== "breakfast") continue;
    for (const menu of item.menus ?? []) {
      if (!HOT_BREAKFAST_BRANDS.has(menu.brand?.name)) continue;
      return {
        inService: true,
        name: "Hot Hands",
        tagline: "Breakfast",
        hero: (menu.name ?? "").trim(),
        dishes: dishesFromElements(menu.scheduledElements),
        sourceUrl: BREAKFAST_SOURCE_URL,
      };
    }
  }
  return emptyBreakfast();
}

function lunchStationsFromPayload(payload) {
  const lunch = payload.find(
    (item) => item.serviceLine?.name?.toLowerCase() === "lunch",
  );
  const byId = new Map();
  for (const menu of lunch?.menus ?? []) {
    const stationId = stationIdForBrand(menu.brand?.name);
    if (!stationId) continue;
    const meta = STATION_BY_ID.get(stationId);
    if (!meta) continue;
    byId.set(stationId, stationFromMenu(menu, meta));
  }
  return byId;
}

export async function scrapeMenu() {
  const marketId = await getBellevueMarketId();
  const days = [];

  for (const date of weekdayDatesForWeek()) {
    const isoDate = isoDateLocal(date);
    process.stderr.write(`Fetching ${isoDate}...\n`);

    let payload;
    try {
      payload = await fetchMealsForDate(marketId, isoDate);
    } catch (err) {
      process.stderr.write(`Warning: meals fetch failed for ${isoDate} (${err.message})\n`);
      continue;
    }

    const lunchById = lunchStationsFromPayload(payload);
    if (lunchById.size === 0) continue;

    const stations = STATION_ORDER.map((id) => {
      return lunchById.get(id) ?? offServiceStation(STATION_BY_ID.get(id));
    });

    let breakfast = emptyBreakfast();
    try {
      breakfast = breakfastFromPayload(payload);
    } catch (err) {
      process.stderr.write(`Warning: breakfast parse failed for ${isoDate} (${err.message})\n`);
    }

    days.push({
      day: DAY_NAMES[date.getDay()],
      date: formatMenuDate(date),
      stations,
      breakfast,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    weekLabel: weekLabelForDate(),
    surveyUrl:
      "https://cxmresponse.omnixm.com/#/response?q=%26%25$%2Fsid232974%26%25$%2F%3D6399%3DRestaurant%3Dfalse%3D0%3D0%3D0%3DWebLink%3D0",
    sources: [
      {
        id: "breakfast",
        name: "Hot Hands Breakfast",
        url: BREAKFAST_SOURCE_URL,
      },
      ...STATIONS.map(({ id, name, url }) => ({ id, name, url })),
    ],
    days,
  };
}

export function isValidMenu(menu) {
  return Boolean(
    menu &&
      typeof menu.weekLabel === "string" &&
      menu.weekLabel.length > 0 &&
      Array.isArray(menu.days) &&
      menu.days.length > 0,
  );
}

export async function writeMenu(menu, outPath = OUT_PATH) {
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(menu, null, 2) + "\n");
}

async function main() {
  const menu = await scrapeMenu();
  if (!isValidMenu(menu)) {
    throw new Error("Scrape produced no menu days");
  }
  await writeMenu(menu);
  process.stderr.write(
    `Wrote ${OUT_PATH} – ${menu.days.length} days, ${STATIONS.length} stations.\n`,
  );
}

const isDirectRun = process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
