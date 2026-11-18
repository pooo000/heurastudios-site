#!/usr/bin/env python3
"""The Datasets page's data (/datasets/), from the Heura Studios app's dataset library.

    python3 _tools/make-datasets.py <app checkout>

reads <app>/studio/dataset_library (catalog.json, csv/<slug>.csv, credits/<slug>.csv) and the topics' names and order
from <app>/studio/datasets.py (CATEGORIES), and writes _data/datasets.json: every set in the app's order, by topic, with
what its card and its preview show. Run it from a checkout of what app.heurastudios.com runs (the app repo's `live`),
so the page lists the sets the app has. Standard library only.

What it takes from each set: its title, topic, description, size, source and license, how its rows were picked, and the
three sample rows the app's catalog keeps for its own preview (already cut short there, with "…"). Each sample row is
found in the set's CSV, for its row number and, where the set ships per-row credits (Stack Exchange's CC BY-SA,
Tatoeba's CC BY, MedQuAD's pages), its credits: who wrote it and where, linked, and its license. It fails loudly
instead of writing a page that would be wrong: a sample that isn't one of its set's rows, a license it doesn't know,
a topic the page has no icon for (_data/datasets_page.yml), or an attribution that still points at credits.csv (the
app's file, which the site doesn't serve).
"""
import csv
import json
import re
import subprocess
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
OUT = SITE / "_data" / "datasets.json"
PAGE = SITE / "_data" / "datasets_page.yml"

# the deeds for the licenses rows carry one by one (a set's own license_url comes from the catalog)
DEEDS = {
    "CC BY-SA 2.5": "https://creativecommons.org/licenses/by-sa/2.5/",
    "CC BY-SA 3.0": "https://creativecommons.org/licenses/by-sa/3.0/",
    "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
    "CC BY 2.0 FR": "https://creativecommons.org/licenses/by/2.0/fr/deed.en",
    "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
    "CC0 1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
}
TEASER = 84   # a featured card's one-row peek: its question and answer cut to this many characters
# The Stack Exchange sets' posts lost their Markdown bold and italic marks in the app's library (its
# tools/datasets/plain_text.py), all but English usage's, where italics mark the word being discussed. A preview says
# so, as their CC BY-SA asks of a change.
KEPT_EMPHASIS = {"english-usage"}


def fail(message):
    sys.exit(f"make-datasets: {message}")


def categories(app):
    """the app's topics, in its page's order: [(id, name)] from studio/datasets.py's CATEGORIES"""
    text = (app / "studio" / "datasets.py").read_text(encoding="utf-8")
    m = re.search(r"^CATEGORIES = \((.*?)\)\n(?=\S)", text, re.S | re.M)
    if not m:
        fail("no CATEGORIES in studio/datasets.py")
    found = re.findall(r'\("([a-z]+)", "([^"]+)"\)', m.group(1))
    if not found:
        fail("CATEGORIES in studio/datasets.py lists no topics")
    return found


def icons():
    """the topics the page has an icon for (the keys under icons: in _data/datasets_page.yml)"""
    text = PAGE.read_text(encoding="utf-8")
    block = re.search(r"^icons:\n((?:[ #].*\n|\n)*)", text, re.M)
    return set(re.findall(r"^  ([a-z]+):", block.group(1), re.M)) if block else set()


def label(n):
    return f"{n:,}"


def size(n):
    """as the app says a file's size (web/studio/ui.js fileSize)"""
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{round(n / 1024)} KB"
    return f"{n / 1024 / 1024:.1f} MB"


def deed(name, where):
    if name not in DEEDS:
        fail(f"{where}: a license the page doesn't know: {name!r} (add its deed to DEEDS)")
    return DEEDS[name]


def short(text, most=TEASER):
    text = text.rstrip("…").strip()
    if len(text) <= most:
        return text
    cut = text[:most].rsplit(" ", 1)[0].rstrip(",.;:–—- ")
    return f"{cut}…"


def teaser(samples):
    """a featured card's peek at the first row: the question's first paragraph (or its second, when every sample
    opens with the same line, as a classifying set's "Which customer-support request is this?" does) and the answer's"""
    paras = [s["q"].split("\n\n") for s in samples]
    same = len(samples) > 1 and all(len(p) > 1 for p in paras) and len({p[0] for p in paras}) == 1
    q = paras[0][1] if same else paras[0][0]
    return {"q": short(q.replace("\n", " ")), "a": short(samples[0]["a"].split("\n\n")[0].replace("\n", " "))}


def part(what, url, by="", by_url="", license_=""):
    for u in (url, by_url):
        if u and not u.startswith(("https://", "http://")):
            fail(f"a credit link that isn't a web address: {u!r}")
    p = {"what": what, "url": url}
    if by:
        p["by"] = by
        if by_url:
            p["by_url"] = by_url
    if license_:
        p["license"], p["license_url"] = license_, deed(license_, what)
    return p


def shared(parts, licenses):
    """one license for the whole row when its parts share it, else each part's own"""
    if len(set(licenses)) == 1:
        return {"license": licenses[0], "license_url": deed(licenses[0], "a row")}
    for p, lic in zip(parts, licenses):
        p["license"], p["license_url"] = lic, deed(lic, p["what"])
    return {}


def credit(slug, row):
    """a row's credits as the preview shows them: {parts: [{what, url, by, by_url, license}], site, license}"""
    cols = set(row)
    if {"question_url", "answer_url"} <= cols:   # Stack Exchange: the question and the answer, each with its author
        lic = row["license"]
        m = re.fullmatch(r"Q: (.+); A: (.+)", lic)
        licenses = [m.group(1), m.group(2)] if m else [lic, lic]
        parts = [part("Question", row["question_url"], row["question_author"], row["question_author_url"]),
                 part("Answer", row["answer_url"], row["answer_author"], row["answer_author_url"])]
        # (a set whose answers are labels, not posts, has the question's credits only: identify-question-field)
        kept = [(p, lic) for p, lic in zip(parts, licenses) if p["url"] or p.get("by")]
        parts, licenses = [p for p, _ in kept], [lic for _, lic in kept]
        return {"parts": parts, "site": row["site"], **shared(parts, licenses)}
    if {"english_sentence_url", "translation_sentence_url"} <= cols:   # Tatoeba: a sentence and its translation
        language = slug.rsplit("-", 1)[-1].capitalize()
        parts = [part("English", row["english_sentence_url"], row["english_author"], row["english_author_url"]),
                 part(language, row["translation_sentence_url"], row["translation_author"], row["translation_author_url"])]
        return {"parts": parts, "site": "Tatoeba", **shared(parts, [row["english_license"], row["translation_license"]])}
    if {"sentence_url", "language"} <= cols:   # Tatoeba: one sentence in a language
        parts = [part(f"{row['language']} sentence", row["sentence_url"], row["author"], row["author_url"])]
        return {"parts": parts, "site": "Tatoeba", **shared(parts, [row["license"]])}
    if {"page_url", "medquad_file"} <= cols:   # MedQuAD: the NIH page an answer comes from, and its MedQuAD file
        parts = [part(row["site"], row["page_url"]), part("MedQuAD", row["medquad_file"])]
        return {"parts": parts, **shared(parts, [row["license"]])}
    fail(f"{slug}: credits with columns the page doesn't know: {sorted(cols)}")


# The catalog's attributions point at credits.csv, the app's file of every row's credits. The site doesn't serve it,
# so these say where the credits are instead (each matched once; anything left that names credits.csv stops the run).
ATTRIBUTION = [
    (r" as shown in credits\.csv, which [^.]*\.", " as shown in the credits for each row."),
    (r"\. credits\.csv links every sentence and names and links its author",
     ". The credits for each row link every sentence and name and link its author"),
    (r"; credits\.csv links every sentence and names and links its author",
     "; the credits for each row link every sentence and name and link its author"),
    (r" are listed in credits\.csv\.", " are listed in its credits."),
]


def attribution(slug, text):
    for pattern, new in ATTRIBUTION:
        text = re.sub(pattern, new, text)
    if "credits.csv" in text:
        fail(f"{slug}: its attribution still names credits.csv; add a rule to ATTRIBUTION: {text!r}")
    return text


def main():
    if len(sys.argv) != 2:
        fail("usage: python3 _tools/make-datasets.py <app checkout>")
    app = Path(sys.argv[1]).resolve()
    lib = app / "studio" / "dataset_library"
    if not (lib / "catalog.json").is_file():
        fail(f"no studio/dataset_library/catalog.json in {app}")
    catalog = json.loads((lib / "catalog.json").read_text(encoding="utf-8"))
    topics = categories(app)
    names = dict(topics)
    missing = [t for t, _ in topics if t not in icons()]
    if missing:
        fail(f"no icon in _data/datasets_page.yml for {', '.join(missing)}")
    try:
        commit = subprocess.run(["git", "-C", str(app), "rev-parse", "--short=7", "HEAD"], capture_output=True,
                                text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        commit = ""

    order = [t for t, _ in topics]
    unknown = sorted({d["category"] for d in catalog} - set(order))
    if unknown:
        fail(f"sets in topics studio/datasets.py doesn't list: {unknown}")
    sets = []
    for d in sorted(catalog, key=lambda d: order.index(d["category"])):   # (stable: the catalog's order within one)
        slug = d["slug"]
        with open(lib / "csv" / f"{slug}.csv", encoding="utf-8", newline="") as f:
            rows = list(csv.DictReader(f))
        if len(rows) != d["rows"]:
            fail(f"{slug}: the catalog says {d['rows']} rows, its CSV has {len(rows)}")
        credits = None
        if d.get("credits"):
            with open(lib / "credits" / f"{slug}.csv", encoding="utf-8", newline="") as f:
                credits = list(csv.DictReader(f))
            if len(credits) != len(rows):
                fail(f"{slug}: {len(credits)} credit rows for {len(rows)} rows")
        samples = []
        for s in d["samples"]:
            q, a = s["q"].rstrip("…"), s["a"].rstrip("…")
            hits = [i for i, r in enumerate(rows) if r["question"].startswith(q) and r["answer"].startswith(a)]
            if not hits:
                fail(f"{slug}: a sample that isn't one of its rows: {s['q'][:60]!r}")
            if credits is not None and len(hits) > 1:
                fail(f"{slug}: a sample that matches {len(hits)} rows, so its credits are unclear: {s['q'][:60]!r}")
            i = hits[0]
            sample = {"row": i + 1, "q": s["q"], "a": s["a"]}
            if credits is not None:
                if credits[i]["row"] != str(i + 1):
                    fail(f"{slug}: credits row {credits[i]['row']} where row {i + 1} should be")
                sample["credit"] = credit(slug, credits[i])
            samples.append(sample)
        se = credits is not None and "question_url" in credits[0]
        cut = any(s["q"].endswith("…") or s["a"].endswith("…") for s in d["samples"])
        plain = se and slug not in KEPT_EMPHASIS
        note = ("Posts are shown without their bold and italic marks, and long rows are cut short here (…)." if plain and cut
                else "Posts are shown without their bold and italic marks." if plain
                else "Long rows are cut short here (…)." if cut else "")
        src = d["source"]
        sets.append({
            "slug": slug, "title": d["title"], "topic": d["category"], "topic_name": names[d["category"]],
            "description": d["description"], "rows": d["rows"], "rows_label": label(d["rows"]),
            "size_label": size(d["bytes"]),
            "source": {"name": src["name"], "url": src.get("url") or src.get("dataset_url") or "",
                       "license": src["license"], "license_url": src.get("license_url") or "",
                       "attribution": attribution(slug, src.get("attribution") or "")},
            "how": d["how"], "teaser": teaser(d["samples"]), "samples": samples, "note": note,
        })
    slugs = [s["slug"] for s in sets]
    if len(set(slugs)) != len(slugs):
        fail("two sets with one slug")
    clash = set(slugs) & (set(order) | {"main", "all", "ask", "featured"})
    if clash:
        fail(f"a slug that is also an id on the page: {sorted(clash)}")

    rows = sum(s["rows"] for s in sets)
    out = {
        "from": {"repo": "pooo000/heurastudios-app", "commit": commit, "path": "studio/dataset_library"},
        "count": len(sets), "rows": rows, "rows_label": label(rows),
        "topics": [{"id": t, "name": name, "count": sum(1 for s in sets if s["topic"] == t),
                    "rows_label": label(sum(s["rows"] for s in sets if s["topic"] == t))}
                   for t, name in topics if any(s["topic"] == t for s in sets)],
        "datasets": sets,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{OUT.relative_to(SITE)}: {len(sets)} sets, {label(rows)} rows, {len(out['topics'])} topics"
          f"{f', from {commit}' if commit else ''}")


if __name__ == "__main__":
    main()
