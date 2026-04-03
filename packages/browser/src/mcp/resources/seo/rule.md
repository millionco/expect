---
name: fixing-seo
description: >
  Audit and fix HTML metadata including page titles, meta descriptions, canonical URLs, Open Graph
  tags, Twitter cards, favicons, JSON-LD structured data, and robots directives. Use when adding
  SEO metadata, fixing social share previews, reviewing Open Graph tags, setting up canonical URLs,
  or shipping new pages that need correct meta tags.
version: 1.0.1
license: MIT
---

# Fixing SEO

## Checklist

### Correctness & Duplication (CRITICAL)

- [ ] Define metadata in one place per page — no competing systems
- [ ] No duplicate title, description, canonical, or robots tags
- [ ] Metadata must be deterministic — no random or unstable values
- [ ] Escape and sanitize dynamic/user-generated strings
- [ ] Every page has safe defaults for title and description

### Title & Description (HIGH)

- [ ] Every page has a title in a consistent format
- [ ] Titles short and readable — no keyword stuffing
- [ ] Shareable pages have a meta description (plain text, no markdown)

### Canonical & Indexing (HIGH)

- [ ] Canonical points to the preferred URL
- [ ] `noindex` only for private, duplicate, or non-public pages
- [ ] Robots meta matches actual access intent
- [ ] Staging/preview pages are `noindex` by default

### Social Cards (HIGH)

- [ ] Shareable pages set OG title, description, and image
- [ ] OG/Twitter images use absolute URLs with correct dimensions
- [ ] `og:url` matches canonical; `og:type` is sensible (website/article)
- [ ] `twitter:card` set appropriately (default: `summary_large_image`)

### Icons & Manifest (MEDIUM)

- [ ] At least one cross-browser favicon; apple-touch-icon when relevant
- [ ] Manifest valid and referenced; icon paths stable and cacheable
- [ ] `theme-color` matches page background

### Structured Data (MEDIUM)

- [ ] JSON-LD only when it maps to real page content; must be valid
- [ ] Never invent ratings, reviews, prices, or org details
- [ ] Prefer one structured data block per page

### Locale & Alternates (LOW-MEDIUM)

- [ ] `html lang` set correctly; `og:locale` when localized
- [ ] `hreflang` alternates only for pages that truly exist
- [ ] Localized pages canonicalize correctly per locale

### Tool Boundaries (CRITICAL)

- [ ] Minimal changes — do not refactor unrelated code
- [ ] Follow the project's existing metadata pattern
