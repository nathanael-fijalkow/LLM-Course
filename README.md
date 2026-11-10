# Large Language Models

The course is offered by the [MVA](https://www.master-mva.com/cours/foundations-of-large-language-models/) (Master Vision Apprentissage), during the first semester (October -- January) of the academic year 2026 -- 2027. The course is taught in English and is open to all students of the MVA program.

In 2026, the teachers are [David Louapre](https://scienceetonnante.com/) and [Nathanaël Fijalkow](https://games-automata-play.com/).

A related course is offered for the second semester in 2026 -- 2027 by [Marc Lelarge](https://www.di.ens.fr/~lelarge/) and [Guillaume Baudart](https://guillaume.baudart.eu/), called [Large Language Models for Code and Proof](https://www.master-mva.com/cours/large-language-models-for-code-and-proof/).

---

## Sessions

The sessions alternate between the two teachers: David stands for David Louapre and Nath for Nathanaël Fijalkow. The material of each session is added here once it has taken place.

David's lectures come as slides in PDF. Nath's lectures come as slides, lecture notes (the slides with the explanations given in class and the lab with its results) and a notebook (the lab, ready to run).

| Session | Date | Teacher | Topic | Material |
|---------|------|---------|-------|----------|
| 1 | October 1 | David | Language models | [Slides (PDF)](david/lecture01.pdf), [Hugging Face Space: NLP before LLMs](https://huggingface.co/spaces/dlouapre/nlp-before-llms) |
| 2 | October 29 | Nath | Transformers | [Slides: perspectives on generative AI](slides/00_perspectives.html), [Slides: Transformers 101](slides/01_transformers_101.html), [Lecture notes](notes/01_transformers_101.html), [Notebook](notebooks/01_transformers_101.ipynb) |
| 3 | November 5 | David | Pre-training and scaling laws | [Slides, part 1 (PDF)](david/lecture03_part1.pdf), [Slides, part 2 (PDF)](david/lecture03_part2.pdf) |
| 4 | November 12 | Nath | Post-training and alignment | [Slides](slides/05_post_training.html), [Lecture notes](notes/05_post_training.html), [Notebook](notebooks/05_post_training.ipynb) |
| 5 | November 19 | David | Decoding and inference optimization | |
| 6 | November 26 | Nath | Advanced architectures | |
| 7 | December 3 | David | Agents | |
| 8 | December 10 | Nath | Advanced topics | |


## Repository layout

- `src/`: the sources. Each lecture is one Quarto file, `src/<lecture>.qmd`, which builds the slides, the lecture notes and the notebook. The folder also holds the figures (`figs/`, with the scripts that draw them in `figs/src/`), the animations of the slides (`anim/`) and the Quarto filter and styles.
- `slides/`, `notes/`, `notebooks/`: the rendered slides, lecture notes and notebooks. They are generated from `src/`: edit the sources, not these files.

## Building

Install [Quarto](https://quarto.org/docs/get-started/) and the Python environment (`uv sync`), then run `render.py` from the root of the repository:

```sh
python3 render.py                  # every lecture, every output
python3 render.py 01 06            # lectures 01 and 06
python3 render.py 01 --slides      # only the slides of lecture 01 (seconds)
python3 render.py --stale          # the lectures whose outputs are older than their source
python3 render.py --list           # the lectures and their outputs
```

The lecture notes and the notebook run the lab of the lecture. The execution is cached, and runs again only when a code cell changes; it can then take several minutes.
