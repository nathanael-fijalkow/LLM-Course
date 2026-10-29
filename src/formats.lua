--[[
One source, three outputs. A deck that lists the formats revealjs, html and
ipynb renders to slides, lecture notes and a notebook. This filter decides
what goes where.

  ::: slides          only on the slides
  ::: lecture         only in the lecture notes (and in the speaker notes
                      of the slides, when the block has no heading)
  ::: notebook        only in the notebook
  ::: {.lecture .notebook}   in the notes and the notebook, not on the slides
                      (the lab)
  ::: answer          the answer to a quiz: not on the slides, folded in the
                      notes and the notebook

An interview question is a slide whose heading has the class `.interview`,
`## Interview: ... {.interview}`, followed by the question and a `::: answer`
block with the detailed answer. It is styled apart on the slides (custom.css)
and in the notes (notes.css), where the answer is folded under "Answer and
discussion". The notebook leaves interview questions out.

Unmarked content goes everywhere. Other rules:

- `. . .` pauses, `<br>` spacers and HTML comments (the slide markers) only
  exist on the slides.
- A code cell with `#| class-source: hide-on-slides` shows its output on the
  slides but not its code (`echo: false` would also remove the code from the
  notebook).
- A heading with the class `.lab` gets a link to the notebook in the notes.
- The notes and the notebook start with links to the other two outputs, and
  each section of the notebook links back to the same section of the notes.
  The links are built from the metadata `course-repo` and `site-url`
  (see _quarto.yml).
]]

local TARGETS = { slides = true, lecture = true, notebook = true }

local function current()
  if quarto.doc.is_format("revealjs") then return "slides" end
  if quarto.doc.is_format("ipynb") then return "notebook" end
  return "lecture"
end

local stem = pandoc.path.split_extension(pandoc.path.filename(quarto.doc.input_file))
local links = {}

local function has_header(blocks)
  local found = false
  pandoc.walk_block(pandoc.Div(blocks), {
    Header = function() found = true end,
  })
  return found
end

local function link(text, url)
  return pandoc.Link(pandoc.Inlines(text), url)
end

function Meta(meta)
  local repo = meta["course-repo"] and pandoc.utils.stringify(meta["course-repo"])
  -- A deck without a lab (`course-notebook: false`) has no notebook to link to
  if meta["course-notebook"] == false then repo = nil end
  local site = meta["site-url"] and pandoc.utils.stringify(meta["site-url"]) or "../"
  if repo then
    links.colab = "https://colab.research.google.com/github/" .. repo .. "/blob/main/notebooks/" .. stem .. ".ipynb"
    links.github = "https://github.com/" .. repo .. "/blob/main/notebooks/" .. stem .. ".ipynb"
  end
  -- From the notebook: absolute when site-url is the published site
  links.notes = site .. "notes/" .. stem .. ".html"
  links.slides_from_notebook = site .. "slides/" .. stem .. ".html"
  links.slides_from_notes = "../slides/" .. stem .. ".html"
end

local function filter_blocks()
  return {
    Div = function(el)
      -- A code cell: at this stage, class-source is an attribute of the cell, not a class of its code
      if el.classes:includes("cell") then
        if current() == "slides" and (el.attributes["class-source"] or ""):find("hide-on-slides", 1, true) then
          el.content = el.content:filter(function(b)
            return not (b.t == "CodeBlock" and b.classes:includes("cell-code"))
          end)
          return el
        end
        return nil
      end
      -- Quiz answers: hidden on the slides, folded elsewhere
      if el.classes:includes("answer") then
        if current() == "slides" then return {} end
        if current() == "notebook" then
          -- inline, to stay in a markdown cell: pandoc turns raw blocks into raw cells, which Jupyter does not render
          local body = pandoc.write(pandoc.Pandoc(el.content), "markdown")
          return pandoc.Plain({ pandoc.RawInline("markdown", "<details><summary>Answer</summary>\n\n" .. body .. "\n</details>") })
        end
        local blocks = pandoc.Blocks({ pandoc.RawBlock("html", "<details><summary>Answer</summary>") })
        blocks:extend(el.content)
        blocks:insert(pandoc.RawBlock("html", "</details>"))
        return blocks
      end
      local tagged, keep = false, false
      for _, c in ipairs(el.classes) do
        if TARGETS[c] then
          tagged = true
          if c == current() then keep = true end
        end
      end
      if not tagged then return nil end
      if keep then return el.content end
      -- Lecture prose doubles as speaker notes on the slides
      if current() == "slides" and el.classes:includes("lecture") and not el.classes:includes("notebook")
          and not has_header(el.content) then
        return pandoc.Div(el.content, pandoc.Attr("", { "notes" }))
      end
      return {}
    end,

    -- Slide markers such as <!-- type: content --> would become empty raw cells in the notebook
    RawBlock = function(el)
      if current() ~= "slides" and el.format == "html" and el.text:match("^%s*<!%-%-.*%-%->%s*$") then
        return {}
      end
    end,

    Para = function(el)
      if current() ~= "slides" and pandoc.utils.stringify(el) == ". . ." then
        return {}
      end
      -- <br> spacers only make sense on the slides
      if current() ~= "slides" then
        local content = el.content:filter(function(i)
          return not (i.t == "RawInline" and i.format == "html" and i.text:match("^<br%s*/?>$"))
        end)
        if #content < #el.content then
          while #content > 0 and (content[1].t == "SoftBreak" or content[1].t == "Space") do content:remove(1) end
          if #content == 0 then return {} end
          el.content = content
        end
      end
      -- The figures are drawn for the dark slides: give them a dark backdrop in Jupyter
      -- (not the figures that code cells produce: wrapped, the ipynb writer drops them)
      if current() == "notebook" and #el.content == 1 and el.content[1].t == "Image"
          and not el.content[1].src:find("_files/figure-", 1, true) then
        return pandoc.Para({
          pandoc.RawInline("html", '<span style="display: inline-block; background-color: #002b36; padding: 12px; border-radius: 6px;">'),
          el.content[1],
          pandoc.RawInline("html", "</span>"),
        })
      end
      return el   -- pandoc keeps in-place changes only when the element is returned
    end,

    Header = function(el)
      if current() == "lecture" and el.classes:includes("lab") and links.colab then
        return {
          el,
          pandoc.Para({
            pandoc.Emph({ pandoc.Str("This part runs in the notebook: ") }),
            link("open it in Colab", links.colab),
            pandoc.Str(" or "),
            link("view it on GitHub", links.github),
            pandoc.Str("."),
          }),
        }
      end
      if current() == "notebook" and el.level == 1 and el.identifier ~= "" then
        return {
          el,
          pandoc.Para({ pandoc.Emph({ link("Lecture notes for this section", links.notes .. "#" .. el.identifier) }) }),
        }
      end
    end,
  }
end

local function add_header_links()
  return {
    Pandoc = function(doc)
      local first
      if current() == "slides" then
        -- Lecture prose before the first heading (the introduction of the notes) is not a speaker note
        local blocks = pandoc.Blocks({})
        local seen_header = false
        for _, b in ipairs(doc.blocks) do
          seen_header = seen_header or b.t == "Header"
          if seen_header or not (b.t == "Div" and b.classes:includes("notes")) then
            blocks:insert(b)
          end
        end
        doc.blocks = blocks
        return doc
      elseif current() == "notebook" then
        first = pandoc.Para({
          pandoc.Strong({ pandoc.Str("Lecture:") }), pandoc.Space(),
          link("notes", links.notes), pandoc.Str(" · "),
          link("slides", links.slides_from_notebook),
        })
        if links.colab then
          first.content:extend({ pandoc.Str(" · "), link("open this notebook in Colab", links.colab) })
        end
      elseif current() == "lecture" then
        first = pandoc.Para({
          pandoc.Strong({ pandoc.Str("Also available as:") }), pandoc.Space(),
          link("slides", links.slides_from_notes),
        })
        if links.colab then
          first.content:extend({
            pandoc.Str(" · "), link("notebook (Colab)", links.colab),
            pandoc.Str(" · "), link("notebook (GitHub)", links.github),
          })
        end
      end
      if first then doc.blocks:insert(1, first) end
      return doc
    end,
  }
end

-- Interview questions: out of the notebook, and a distinct fold for their answers in the notes
local function interview_sections()
  return {
    Pandoc = function(doc)
      if current() == "slides" then return nil end
      local blocks = pandoc.Blocks({})
      local level   -- level of the heading of the interview section we are in, if any
      for _, b in ipairs(doc.blocks) do
        if b.t == "Header" then
          if level and b.level <= level then level = nil end
          if b.classes:includes("interview") then level = b.level end
        end
        if level and current() == "notebook" then
          -- skipped
        elseif level and b.t == "RawBlock" and b.text == "<details><summary>Answer</summary>" then
          blocks:insert(pandoc.RawBlock("html", '<details class="interview-answer"><summary>Answer and discussion</summary>'))
        else
          blocks:insert(b)
        end
      end
      doc.blocks = blocks
      return doc
    end,
  }
end

return {
  { Meta = Meta },
  filter_blocks(),
  interview_sections(),
  add_header_links(),
}
