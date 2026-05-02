// Einmal-Extraktion der Schweizer Landesgrenze. Quelle ist
// @geo-maps/countries-land-100m (~126MB World-File, deshalb laden wir nicht
// als npm-Dep sondern ueber unpkg-CDN als One-Shot). 100m-Aufloesung gibt
// uns ~2570 Punkte fuer die Hauptkontur — feingenug bis Zoom 13.
// Schreibt nach src/data/swiss-boundary.json (~120kb).
//
// Aufruf: node scripts/extract-swiss-boundary.mjs

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const SRC_URL = "https://unpkg.com/@geo-maps/countries-land-100m/map.geo.json";
const tmpFile = path.join(os.tmpdir(), "world-land-100m.geo.json");

console.log(`fetching ${SRC_URL} -> ${tmpFile}`);
const res = await fetch(SRC_URL);
if (!res.ok) {
  console.error(`fetch failed: ${res.status}`);
  process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());
fs.writeFileSync(tmpFile, buf);
console.log(`downloaded ${(buf.byteLength / (1024 * 1024)).toFixed(1)} mb`);

const data = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
const che = data.features.find((f) => f.properties?.A3 === "CHE");
if (!che) {
  console.error("CHE feature not found");
  process.exit(1);
}

console.log(`geom: ${che.geometry.type}`);
if (che.geometry.type === "Polygon") {
  console.log(`  rings: ${che.geometry.coordinates.length}, outer pts: ${che.geometry.coordinates[0].length}`);
} else {
  console.log(`  polys: ${che.geometry.coordinates.length}`);
  for (const p of che.geometry.coordinates) {
    console.log(`    outer pts: ${p[0].length}`);
  }
}

// @geo-maps definiert Land-Polygone mit Inner-Rings fuer Seen/Land-Features
// (>1000 Loch-Rings bei der Schweiz). Mit fill:false rendert Leaflet jeden
// Ring als Stroke — wir bekaemen Konturen um jeden See, das ist Laerm.
// Nur den OUTER-Ring der Haupt-Polygon-Kontur behalten:
//   - Polygon: coordinates[0]
//   - MultiPolygon: das Sub-Polygon mit den meisten Outer-Punkten, dessen
//     Outer-Ring [0]
let outerRing;
if (che.geometry.type === "Polygon") {
  outerRing = che.geometry.coordinates[0];
} else {
  const mainSubpoly = che.geometry.coordinates.reduce((best, p) =>
    p[0].length > best[0].length ? p : best,
  );
  outerRing = mainSubpoly[0];
}
console.log(`  outer ring: ${outerRing.length} pts (inner rings dropped)`);

const out = {
  type: "Feature",
  properties: {},
  geometry: { type: "Polygon", coordinates: [outerRing] },
};

const dest = path.join("src", "data", "swiss-boundary.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out));
console.log(`wrote ${dest} (${(fs.statSync(dest).size / 1024).toFixed(1)} kb)`);

fs.unlinkSync(tmpFile);
console.log("cleaned up tmp file");
