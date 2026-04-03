# `accessibility_audit` Rule ID Mapping

Maps common `ruleId` values from axe-core and IBM Equal Access to WCAG criteria and fixes.

## How to Use

When `accessibility_audit` returns a violation, find the `ruleId` in the table below. Apply the fix in the "Typical Fix" column. If the `ruleId` is not listed, read the violation's `description` and `nodes[].failureSummary` fields — they contain the exact fix instructions.

## Accessible Names

| `ruleId`          | WCAG  | Typical Fix                                |
| ----------------- | ----- | ------------------------------------------ |
| `button-name`     | 4.1.2 | Add `aria-label` or visible text           |
| `image-alt`       | 1.1.1 | Add `alt` attribute (meaningful or `""`)   |
| `label`           | 1.3.1 | Add `<label>` or `aria-label` to input     |
| `link-name`       | 4.1.2 | Replace generic text with descriptive text |
| `input-image-alt` | 1.1.1 | Add `alt` to `<input type="image">`        |
| `svg-img-alt`     | 1.1.1 | Add `role="img"` + `aria-label` to SVG     |
| `area-alt`        | 1.1.1 | Add `alt` to `<area>` elements             |

## Keyboard Access

| `ruleId`                      | WCAG  | Typical Fix                             |
| ----------------------------- | ----- | --------------------------------------- |
| `keyboard`                    | 2.1.1 | Make element keyboard-operable          |
| `tabindex`                    | 2.4.3 | Remove `tabindex` > 0                   |
| `focus-order-semantics`       | 2.4.3 | Fix focus order or add `tabindex="0"`   |
| `scrollable-region-focusable` | 2.1.1 | Add `tabindex="0"` to scrollable region |

## Semantics

| `ruleId`                | WCAG  | Typical Fix                               |
| ----------------------- | ----- | ----------------------------------------- |
| `aria-required-attr`    | 4.1.2 | Add missing required ARIA attributes      |
| `aria-valid-attr-value` | 4.1.2 | Fix invalid ARIA attribute values         |
| `aria-valid-attr`       | 4.1.2 | Remove invalid ARIA attributes            |
| `aria-roles`            | 4.1.2 | Use valid ARIA role or native element     |
| `heading-order`         | 1.3.1 | Fix skipped heading levels                |
| `list`                  | 1.3.1 | Ensure `<ul>`/`<ol>` only contains `<li>` |
| `landmark-one-main`     | 1.3.1 | Add `<main>` landmark                     |
| `region`                | 1.3.1 | Wrap content in landmark regions          |

## Forms

| `ruleId`                | WCAG  | Typical Fix                               |
| ----------------------- | ----- | ----------------------------------------- |
| `aria-input-field-name` | 4.1.2 | Associate label with input via `for`/`id` |
| `autocomplete-valid`    | 1.3.5 | Fix `autocomplete` attribute value        |
| `select-name`           | 4.1.2 | Add `<label>` or `aria-label` to select   |

## Contrast

| `ruleId`                  | WCAG  | Typical Fix                                   |
| ------------------------- | ----- | --------------------------------------------- |
| `color-contrast`          | 1.4.3 | Increase text/background contrast ratio       |
| `color-contrast-enhanced` | 1.4.6 | Meet AAA contrast ratio (7:1)                 |
| `link-in-text-block`      | 1.4.1 | Distinguish links from text (not color alone) |
