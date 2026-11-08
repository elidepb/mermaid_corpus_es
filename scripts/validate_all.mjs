import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const root = "/home/elide-portocarrero/Proyectos/mermaid_corpus_es";
const mermaidJs = path.join(root, "node_modules/mermaid/dist/mermaid.min.js");

function collectDiagrams() {
  const diagrams = [];
  for (const dtype of ["flowchart", "mindmap", "timeline"]) {
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && entry.name.endsWith(".json") && full.includes(`${path.sep}jsons${path.sep}`)) {
          const data = JSON.parse(fs.readFileSync(full, "utf8"));
          for (const d of data.diagrams || []) {
            diagrams.push({
              file: path.relative(root, full),
              id: d.id,
              topic: d.topic,
              diagram_type: d.diagram_type,
              code: d.mermaid_code,
            });
          }
        }
      }
    };
    walk(path.join(root, dtype));
  }
  return diagrams;
}

const diagrams = collectDiagrams();
console.log(`Validating ${diagrams.length} diagrams...`);

const browser = await puppeteer.launch({
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  headless: "new",
});
const page = await browser.newPage();
page.setDefaultTimeout(30000);
await page.addScriptTag({ path: mermaidJs });
await page.evaluate(() => {
  window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: "default",
    flowchart: { useMaxWidth: true, htmlLabels: true, curve: "basis" },
    mindmap: { useMaxWidth: true },
    timeline: {},
  });
});

const failures = [];
let i = 0;
for (const d of diagrams) {
  i += 1;
  const result = await page.evaluate(async (code, renderId) => {
    try {
      await window.mermaid.parse(code);
    } catch (e) {
      return { ok: false, stage: "parse", error: String(e && e.message ? e.message : e).slice(0, 500) };
    }
    try {
      const rendered = await window.mermaid.render(renderId, code);
      const svg = rendered && rendered.svg ? rendered.svg : "";
      if (!svg.toLowerCase().includes("<svg")) {
        return { ok: false, stage: "render", error: "No SVG produced" };
      }
      if (/syntax error in text/i.test(svg) || />syntax error/i.test(svg)) {
        return { ok: false, stage: "render-svg", error: "Syntax error text in SVG" };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, stage: "render", error: String(e && e.message ? e.message : e).slice(0, 500) };
    }
  }, d.code, `mmd-${d.diagram_type}-${d.id}-${i}`);

  if (!result.ok) {
    failures.push({
      file: d.file,
      id: d.id,
      topic: d.topic,
      diagram_type: d.diagram_type,
      stage: result.stage,
      error: result.error,
    });
    console.log(`FAIL ${d.diagram_type}/${d.id} ${d.topic}: ${String(result.error).split("\n")[0]}`);
  }
  if (i % 80 === 0) console.log(`progress ${i}/${diagrams.length} fails=${failures.length}`);
}

await browser.close();

const byType = {};
for (const f of failures) {
  byType[f.diagram_type] = (byType[f.diagram_type] || 0) + 1;
}
const out = {
  total: diagrams.length,
  failed: failures.length,
  passed: diagrams.length - failures.length,
  byType,
  failures,
};
fs.writeFileSync("/tmp/mermaid_es_validation.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify({ total: out.total, passed: out.passed, failed: out.failed, byType }, null, 2));
process.exit(failures.length ? 1 : 0);
