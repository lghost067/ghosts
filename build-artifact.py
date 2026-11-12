"""Bundle index.html + style.css + app.js into one self-contained page (dist/ghostcut.html).

Used for publishing GhostCut as a single-file page. Usage: python3 build-artifact.py
"""
import pathlib
import re

root = pathlib.Path(__file__).parent
html = (root / "index.html").read_text()
css = (root / "style.css").read_text()
js = (root / "app.js").read_text()

body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
body = body.replace('<script src="app.js"></script>', "<script>\n" + js + "\n</script>")

page = "<title>GhostCut</title>\n<style>\n" + css + "\n</style>\n" + body.strip() + "\n"
out = root / "dist" / "ghostcut.html"
out.parent.mkdir(exist_ok=True)
out.write_text(page)
print(f"wrote {out} ({len(page) / 1024:.0f} KB)")
