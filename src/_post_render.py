"""Move the outputs of the decks out of src/.

Quarto writes every output next to its source: the slides (<deck>.html) go to
../slides/<deck>.html, the lecture notes (<deck>_notes.html) to
../notes/<deck>.html and the notebook (<deck>_notebook.ipynb) to
../notebooks/<deck>.ipynb. The suffixes keep the names of the three outputs of a
deck apart.
"""

import os
import shutil
from pathlib import Path

here = Path(__file__).parent
for name in os.environ.get("QUARTO_PROJECT_OUTPUT_FILES", "").splitlines():
    out = here / name
    if not out.exists():
        continue
    if out.name.endswith("_notes.html"):
        dest = here.parent / "notes" / out.name.replace("_notes.html", ".html")
    elif out.name.endswith("_notebook.ipynb"):
        dest = here.parent / "notebooks" / out.name.replace("_notebook.ipynb", ".ipynb")
    elif out.suffix == ".html":
        dest = here.parent / "slides" / out.name
    else:
        continue
    dest.parent.mkdir(exist_ok=True)
    shutil.move(out, dest)
    print(f"moved {out.name} -> {dest.relative_to(here.parent)}")
