"""把 data/<book>/*.csv 内联进 build/template.html，生成自包含的 index.html。

用法：python build/build.py
"""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
TEMPLATE = Path(__file__).resolve().parent / "template.html"
OUT = ROOT / "index.html"
PLACEHOLDER = "/*__DATA__*/"

BOOK_LABELS = {"book2": "第二册", "book3": "第三册"}


def sanitize(text):
    if not text:
        return ""
    return text.replace("​", "").replace("\xa0", " ").strip()


def natural_key(name):
    return [int(p) if p.isdigit() else p.lower() for p in re.split(r"(\d+)", name)]


def read_book(book_dir):
    units = {}
    for csv_path in sorted(book_dir.glob("*.csv"), key=lambda p: natural_key(p.name)):
        entries = []
        with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                english = sanitize(row.get("english") or "")
                if not english:
                    continue
                entries.append({
                    "e": english,
                    "c": sanitize(row.get("chinese") or ""),
                    "x": sanitize(row.get("examples") or ""),
                })
        if entries:
            units[csv_path.name] = entries
    return units


def main():
    books = {}
    total = 0
    for book_dir in sorted(DATA_DIR.iterdir(), key=lambda p: natural_key(p.name)):
        if not book_dir.is_dir():
            continue
        units = read_book(book_dir)
        if not units:
            continue
        books[book_dir.name] = {
            "label": BOOK_LABELS.get(book_dir.name, book_dir.name),
            "units": units,
        }
        n = sum(len(v) for v in units.values())
        total += n
        print(f"{book_dir.name}: {len(units)} units, {n} entries")

    payload = json.dumps(books, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("</", "<\\/")  # 防止数据中出现 </script>
    template = TEMPLATE.read_text(encoding="utf-8")
    if PLACEHOLDER not in template:
        raise SystemExit("template.html 中找不到数据占位符")
    OUT.write_text(template.replace(PLACEHOLDER, payload), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB, {total} entries)")


if __name__ == "__main__":
    main()
