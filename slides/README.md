# Building Slides

The slide sources are Quarto Reveal.js documents (`.qmd`). Run these commands from the repository root.

## Prerequisites

- Install [Quarto](https://quarto.org/docs/get-started/).
- Create the project Python environment and install the dependencies from `pyproject.toml`.

Quarto needs the project interpreter to execute Python cells:

```sh
QUARTO_PYTHON=.venv/bin/python quarto render slides/01_transformers_101.qmd
```

The command writes the corresponding HTML file next to the source, for example `slides/01_transformers_101.html`.

## Render One Deck

```sh
QUARTO_PYTHON=.venv/bin/python quarto render slides/07_function_calling_agents.qmd
```

## Render All Decks

```sh
QUARTO_PYTHON=.venv/bin/python quarto render slides
```

## Preview While Editing

```sh
QUARTO_PYTHON=.venv/bin/python quarto preview slides/07_function_calling_agents.qmd
```

Stop the preview server with `Ctrl-C`.