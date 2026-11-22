# ElevenLabs Visual & Motion Guidelines

When building, styling, or refactoring UI components in `apps/web`:

## 1. Design Tokens & Aesthetic (`DESIGN.md`)
- Adhere to the design tokens and aesthetic in `DESIGN.md`:
  - **Editorial Atmosphere**: Quiet off-white canvas (`#f5f5f5` in light mode), warm near-black ink (`#0c0a09`), and subtle hairline borders (`#e7e5e4`).
  - **Color Accents**: Soft atmospheric pastel gradient orbs (mint, peach, lavender, sky, rose) instead of loud saturated neons.
  - **CTAs & Shapes**: Dark ink pills (`rounded-full`) for primary actions; subtle outline pills for secondary actions; `rounded-xl` / `rounded-2xl` for cards and floating panels.
  - **Typography**: Light display weight (300) with tight negative tracking (`-0.02em` to `-0.04em`) on titles/headings to mimic the editorial signature. Clear, slightly tracked body font.

## 2. Smoothness & Motion (Emil Kowalski Skills)
- Refer to `.agents/skills/animate` and `.agents/skills/choreograph`.
- Only animate composite properties (`transform`, `opacity`) to maintain 60/120fps and avoid layout reflows (`animation-performance`).
- Avoid blanket `transition-all` declarations. Explicitly transition only targeted properties (e.g. `transition-[transform,opacity]`).
- Keep durations short (150ms–250ms for micro-interactions, 250ms–400ms for panel entrances) with custom ease curves (`cubic-bezier(0.16, 1, 0.3, 1)`).

## 3. Performance & Optimization (Vercel Guidelines)
- Adhere to `.agents/skills/vercel-react-best-practices` and `.agents/skills/web-design-guidelines`.
- Prevent unnecessary re-render cascades, keep client bundles lean, and ensure keyboard accessibility and `:focus-visible` ring clarity.

## 4. UI Components from ElevenLabs Registry (`ui.elevenlabs.io`)
- When adding audio visualizers, orbs, or voice agent cards, install them directly from `ui.elevenlabs.io` via shadcn CLI into `apps/web/src/components/ui/`.
- Ensure icon imports conform to project conventions or replace `lucide-react` with `@remixicon/react` when appropriate.
