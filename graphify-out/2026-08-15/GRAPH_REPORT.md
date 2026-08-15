# Graph Report - Investation  (2026-08-15)

## Corpus Check
- 119 files · ~97,830 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2107 nodes · 2492 edges · 151 communities (110 shown, 41 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 157 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7ea70886`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- logger.js
- package.json
- executor.js
- app.js
- index.js
- graphify Rules
- calculator.js
- kilo.json
- exporters.js
- ledger.js
- bot_status.js
- calendar.js
- comparison.js
- detail.js
- AGENTS.md
- Live Mode
- Real-Time Finance Tracker
- Plan: Date-Based Transaction System
- Plan: Real-Time Finance Tracker
- Plan: Fix Bot State Balance
- Plan: Live Predicted Balance Mode
- Plan: Day-Specific Manual Income Entries
- Plan: Day-Specific Manual Income Entries
- Plan: Live "Actual follows Predicted" Balance Mode (Option A)
- File Changes
- AGENTS.md
- graphify.md
- graphify.md
- BM25
- color
- search
- button
- Tailwind CSS Utility Reference
- slide_search_core.py
- Brand Guidelines v1.0
- Design
- Canvas Design System
- spacing
- Prerequisites
- Form & Input Components
- Tailwind CSS Responsive Design
- Typography Specifications
- Logo Usage Rules
- Component Specifications
- shadcn/ui Accessibility Patterns
- TestTailwindConfigGenerator
- html-token-validator.py
- Asset Approval Checklist
- Logo AI Prompt Engineering
- Color Palette Management
- CIP Deliverable Guide
- BM25
- States and Variants
- UI Styling Skill
- Workflow
- Design System
- Tailwind CSS Customization
- DesignSystemGenerator
- design_system.py
- Routing by Task Type
- generate-slide.py
- shadcn/ui Theming & Customization
- TailwindConfigGenerator
- Asset Organization Guide
- Primary Color Meanings
- Core Logo Types
- Brand Consistency Checklist
- CIP Mockup Prompt Engineering
- fetch-background.py
- Design Principles
- Design Principles
- generate.py
- fontSize
- TestShadcnInstaller
- _palette_is_dark
- CIP Design Reference
- Icon Design Reference
- Copywriting Formulas
- Copywriting Formulas
- main
- Banner Design - Multi-Format Creative Banner System
- Messaging Framework
- Brand Voice Framework
- Layout Patterns
- Tailwind Integration
- Layout Patterns
- pending.js
- update.md
- Logo Design Reference
- .add_components
- ShadcnInstaller
- .generate_config_string
- Core Visual Elements
- CIP Design Style Guide
- primitive
- test_tailwind_config_gen.py
- _resolve_color_mode
- ._base_config
- Brand
- Slide Strategies
- generate.py
- Slide Strategies
- Plan: Sistem Config "Class Perks" — Toggle Semua Perk
- _run
- retry.js
- radius
- Slides Reference
- HTML Slide Template
- HTML Slide Template
- _filter_anti_patterns_for_mode
- generate_design_system
- _select_palette_for_mode
- alert.js
- shadow
- Slides
- Brand Guidelines Template
- lg
- xl
- md
- none
- validate_data.py
- test_sync_brand_to_tokens.py
- main
- shadcn_add.py
- .__init__
- search.py
- slides-create.md
- create.md
- .test_add_components_with_overwrite
- .test_add_components_dry_run
- .test_add_components_success
- .test_add_components_npx_not_found
- .test_add_all_components_no_config
- .test_list_installed_no_config
- .test_init_default_project_root
- .test_init_dry_run
- .test_get_installed_components_empty
- .test_get_installed_components_with_files
- .test_add_components_no_components
- .test_add_fonts
- .test_add_plugins_no_duplicates
- .test_recommend_plugins
- .test_init_default_typescript
- .test_init_javascript
- .test_write_config_creates_content
- .test_write_config_invalid_path
- .test_init_framework
- .test_custom_output_path
- .test_base_config_structure
- default

## God Nodes (most connected - your core abstractions)
1. `TailwindConfigGenerator` - 57 edges
2. `TestTailwindConfigGenerator` - 35 edges
3. `ShadcnInstaller` - 33 edges
4. `DesignSystemGenerator` - 27 edges
5. `TestShadcnInstaller` - 26 edges
6. `UI Styling Skill` - 17 edges
7. `color` - 15 edges
8. `Design` - 15 edges
9. `runDailyJob()` - 14 edges
10. `Tailwind CSS Customization` - 14 edges

## Surprising Connections (you probably didn't know these)
- `graphify Rules` --references--> `graphify-out/graph.json`  [EXTRACTED]
  .agents/rules/graphify.md → graphify-out/graph.json
- `graphify Rules` --references--> `graphify-out/GRAPH_REPORT.md`  [EXTRACTED]
  .agents/rules/graphify.md → graphify-out/GRAPH_REPORT.md
- `TestDomainDetection` --uses--> `BM25`  [INFERRED]
  .kiro/steering/ui-ux-pro-max/scripts/tests/test_core.py → .kiro/steering/design/scripts/cip/core.py
- `TestPersistence` --uses--> `BM25`  [INFERRED]
  .kiro/steering/ui-ux-pro-max/scripts/tests/test_core.py → .kiro/steering/design/scripts/cip/core.py
- `TestReasoningMatch` --uses--> `BM25`  [INFERRED]
  .kiro/steering/ui-ux-pro-max/scripts/tests/test_core.py → .kiro/steering/design/scripts/cip/core.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **graphify Tooling Suite** — _agents_rules_graphify_graphify_query, _agents_rules_graphify_query_graph, _agents_rules_graphify_graphify_path, _agents_rules_graphify_shortest_path, _agents_rules_graphify_graphify_explain, _agents_rules_graphify_get_node, _agents_rules_graphify_graphify_update [EXTRACTED 1.00]
- **Simulation Engine Core** — js_engine_calculator, js_engine_optimizer, js_engine_simulator, js_engine_ledger [EXTRACTED 0.95]

## Communities (151 total, 41 thin omitted)

### Community 0 - "logger.js"
Cohesion: 0.14
Nodes (20): COLORS, emit(), formatLine(), formatMeta(), fs, getHostname(), getLogStream(), getTimestamp() (+12 more)

### Community 1 - "package.json"
Cohesion: 0.11
Nodes (17): axios, dependencies, axios, dotenv, firebase-admin, node-cron, puppeteer, description (+9 more)

### Community 2 - "executor.js"
Cohesion: 0.14
Nodes (19): { db, runTransaction, serverTimestamp, getDoc, setDoc }, DEFAULT_RETRY, { executeInvest }, { Logger }, Pending, runDailyJob(), { sendAlert }, { withRetry, isTransientError } (+11 more)

### Community 3 - "app.js"
Cohesion: 0.17
Nodes (11): Architecture & Logic, Invest Bot, Setup di OrangePi, App, LiveMode, setupPassword(), syncFromFirebase(), syncToFirebase() (+3 more)

### Community 4 - "index.js"
Cohesion: 0.15
Nodes (22): { claimDailyReward }, cron, { db, serverTimestamp }, getTodayId(), { Logger }, markNetworkSkipped(), openBrowser(), Pending (+14 more)

### Community 5 - "graphify Rules"
Cohesion: 0.18
Nodes (11): get_node, graphify Rules, graphify explain, graphify path, graphify query, graphify update, query_graph, shortest_path (+3 more)

### Community 6 - "calculator.js"
Cohesion: 0.40
Nodes (3): Calculator, Optimizer, Simulator

### Community 7 - "kilo.json"
Cohesion: 0.40
Nodes (4): plugin, $schema, snapshot, file:///D:/Investation/.kilo/plugins/graphify.js

### Community 8 - "exporters.js"
Cohesion: 0.50
Nodes (3): ExportCSV, ExportExcel, ExportPDF

### Community 15 - "AGENTS.md"
Cohesion: 0.07
Nodes (27): 1. `index.html` — Remove auth overlay, add right panel structure, 1. Real-Time Transactions (Firestore: `users/{uid}/transactions/{id}`), 2. Categories (constant, local), 2. `css/style.css` — Layout & Daily Log Panel Styles, 3. `js/app.js` — Core Orchestration, 3. Simulation `manualIncome` (unchanged, localStorage), 4. `js/firebase.js` — Extended for Transactions, 5. `js/ui/dailyLog.js` — NEW FILE (+19 more)

### Community 18 - "Plan: Date-Based Transaction System"
Cohesion: 0.14
Nodes (13): 1. Simulator runs from initialBalance (unchanged), 2. Transactions are visual adjustments on specific days, 3. Added `Ledger.getStateAsOfDate(config, targetDate)` in `js/engine/ledger.js`, 4. Firebase Sync Button in `js/app.js`, 5. Removed old live mode injection logic, Affected Files, Goal, How It Works Now (+5 more)

### Community 22 - "Plan: Day-Specific Manual Income Entries"
Cohesion: 0.17
Nodes (11): 1. Remove debug logging (cleanup from investigation), 2. Stop using Firebase bot state as Saldo Awal, 3. Stop auto-updating Saldo Awal on `onSnapshot` events, 4. Add explicit "Sync Saldo Awal from Bot" button (opt-in), 5. Fix LiveMode plan doc reference (informational), Architecture: Saldo Awal vs Saldo Aktual, Plan: Fix Bot State Balance Being Used as Saldo Awal, Problem (+3 more)

### Community 23 - "Plan: Day-Specific Manual Income Entries"
Cohesion: 0.18
Nodes (10): 1. `js/app.js` — Config & UI, 2. `js/engine/simulator.js` — Simulation Injection, 3. `js/app.js` — Results Display, Background, Changes, Data Model, Goal, Plan: Day-Specific Manual Income Entries (+2 more)

### Community 24 - "Plan: Live "Actual follows Predicted" Balance Mode (Option A)"
Cohesion: 0.22
Nodes (8): Data Flow, Goal, Key Decisions, Open Questions, Plan: Live "Actual follows Predicted" Balance Mode (Option A), Risks & Edge Cases, Tasks (ordered), Validation

### Community 25 - "File Changes"
Cohesion: 0.05
Nodes (53): $type, $value, $type, $value, $type, $value, $type, $value (+45 more)

### Community 29 - "BM25"
Cohesion: 0.06
Nodes (42): BM25, detect_domain(), get_cip_brief(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection (+34 more)

### Community 30 - "color"
Cohesion: 0.04
Nodes (48): $type, $value, background, destructive, destructive-foreground, foreground, muted, muted-foreground (+40 more)

### Community 31 - "search"
Cohesion: 0.07
Nodes (28): BM25, detect_domain(), _domain_keywords(), _get_bm25(), _load_csv(), _load_product_keywords(), _normalize(), Apply synonym substitution before tokenizing. (+20 more)

### Community 32 - "button"
Cohesion: 0.06
Nodes (45): $type, $value, $type, $value, bg, fg, font-size, hover-bg (+37 more)

### Community 33 - "Tailwind CSS Utility Reference"
Cohesion: 0.05
Nodes (43): Arbitrary Values, Aspect Ratio, Background Colors, Border Color, Border Radius, Border Style, Border Width, Borders (+35 more)

### Community 34 - "slide_search_core.py"
Cohesion: 0.08
Nodes (36): format_context(), format_result(), main(), Format a single search result for display, Format contextual recommendations for display., BM25, calculate_pattern_break(), detect_domain() (+28 more)

### Community 35 - "Brand Guidelines v1.0"
Cohesion: 0.05
Nodes (37): 1. Color Palette, 2. Typography, 3. Logo Usage, 4. Voice & Tone, 5. Imagery Guidelines, 6. Design Components, Accessibility, AI Image Generation (+29 more)

### Community 36 - "Design"
Cohesion: 0.06
Nodes (35): Banner Design (Built-in), Banner: Design Rules, Banner: Quick Size Reference, Banner: Top Art Styles, Banner: Workflow, CIP Design (Built-in), CIP: Generate Brief, CIP: Generate Mockups (+27 more)

### Community 37 - "Canvas Design System"
Cohesion: 0.06
Nodes (35): 1. Visual Communication First, 2. Minimal Text Integration, 3. Expert Craftsmanship, 4. Systematic Patterns, Analog Meditation, Approach, Canvas Boundaries, Canvas Design System (+27 more)

### Community 38 - "spacing"
Cohesion: 0.06
Nodes (34): $type, $value, $type, $value, $type, $value, $type, $value (+26 more)

### Community 39 - "Prerequisites"
Cohesion: 0.06
Nodes (33): Accessibility, Available Domains, Available Stacks, Common Rules for Professional UI, Common Sticking Points, Example Workflow, How to Use This Skill, Icons & Visual Elements (+25 more)

### Community 40 - "Form & Input Components"
Cohesion: 0.06
Nodes (32): Accordion, Alert, Alert Dialog, Avatar, Badge, Button, Card, Checkbox (+24 more)

### Community 41 - "Tailwind CSS Responsive Design"
Cohesion: 0.06
Nodes (32): 1. Mobile-First Design, 2. Consistent Breakpoint Usage, 3. Test at Breakpoint Boundaries, 4. Use Container for Content Width, 5. Progressive Enhancement, 6. Avoid Too Many Breakpoints, Best Practices, Breakpoint System (+24 more)

### Community 42 - "Typography Specifications"
Cohesion: 0.06
Nodes (30): Accessibility, Base System, Best Practices, Clean & Modern, Common Font Pairings, Contrast Requirements, CSS Implementation, Editorial (+22 more)

### Community 43 - "Logo Usage Rules"
Cohesion: 0.07
Nodes (28): Absolute Don'ts, Approved Backgrounds, Before Using Logo, Clear Space, Co-branding, Color Rules, Color Usage, Color Variants (+20 more)

### Community 44 - "Component Specifications"
Cohesion: 0.07
Nodes (28): Alert, Anatomy, Anatomy, Anatomy, Anatomy, Anatomy, Badge, Button (+20 more)

### Community 45 - "shadcn/ui Accessibility Patterns"
Cohesion: 0.07
Nodes (28): Accordion, Alert, ARIA Labels, Checkbox and Radio, Color Contrast, Command Palette Navigation, Component-Specific Patterns, Dialog/Modal Navigation (+20 more)

### Community 46 - "TestTailwindConfigGenerator"
Cohesion: 0.07
Nodes (15): Test adding colors multiple times., Test adding custom breakpoints., Test TailwindConfigGenerator class., Test generating TypeScript configuration., Test generating JavaScript configuration., Test generating config with custom colors., Test generating config with plugins., Test validating valid configuration. (+7 more)

### Community 47 - "html-token-validator.py"
Cohesion: 0.14
Nodes (24): get_context(), is_allowed_exception(), is_allowed_rgba(), is_inside_block(), load_css_variables(), main(), print_result(), print_summary() (+16 more)

### Community 48 - "Asset Approval Checklist"
Cohesion: 0.08
Nodes (25): Accessibility, Archival, Asset Approval Checklist, Automation Support, Color Compliance, Common Issues & Fixes, Content Accessibility, Content Quality (+17 more)

### Community 49 - "Logo AI Prompt Engineering"
Cohesion: 0.08
Nodes (25): Common Pitfalls, Core Prompt Structure, Detailed Brief, Eco/Sustainable, Effective Keywords by Style, Fashion Brand, Healthcare, Industry-Specific Prompts (+17 more)

### Community 50 - "Color Palette Management"
Cohesion: 0.08
Nodes (24): Accessibility Requirements, Brand Compliance Validation, Checking Contrast, Color Documentation Format, Color Extraction, Color Palette Examples, Color Palette Management, Color System Structure (+16 more)

### Community 51 - "CIP Deliverable Guide"
Cohesion: 0.08
Nodes (24): Apparel, Business Card, Car/Sedan, CIP Deliverable Guide, Core Identity, Digital Assets, Email Signature, Envelope (+16 more)

### Community 52 - "BM25"
Cohesion: 0.11
Nodes (19): BM25, detect_domain(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection, Search across all domains and combine results (+11 more)

### Community 53 - "States and Variants"
Cohesion: 0.08
Nodes (24): Accessibility, Accessibility Requirements, ARIA States, Color Contrast, Color Variants, Disabled States, Error Messages, Error States (+16 more)

### Community 54 - "UI Styling Skill"
Cohesion: 0.08
Nodes (24): Accessibility Patterns, Alternative: Tailwind-Only Setup, Best Practices, Common Patterns, Component Layer: shadcn/ui, Component Library Guide, Component + Styling Setup, Core Stack (+16 more)

### Community 55 - "Workflow"
Cohesion: 0.08
Nodes (23): Art Direction Styles (Reuse from Banner), Color & Contrast, Design Best Practices, HTML Design Rules, HTML Template Structure, Option A: Chrome Headless CLI (Recommended — zero dependencies), Option B: chrome-devtools skill, Option C: Playwright script (+15 more)

### Community 56 - "Design System"
Cohesion: 0.09
Nodes (22): Best Practices, Chart.js Integration, Command, Component Spec Pattern, Contextual Decision Flow, Decision System CSVs, Design System, Integration (+14 more)

### Community 57 - "Tailwind CSS Customization"
Cohesion: 0.09
Nodes (22): @apply Directive, Best Practices, Color Customization, Complete Tailwind Config, Configuration Examples, Content Configuration, Custom Color Palette, Custom Font Sizes (+14 more)

### Community 58 - "DesignSystemGenerator"
Cohesion: 0.13
Nodes (12): DesignSystemGenerator, Generates design system recommendations from aggregated searches., Load reasoning rules from CSV., Execute searches across multiple domains., Find matching reasoning rule for a category., Apply reasoning rules to search results., Select best matching result based on priority keywords., Extract results list from search result dict. (+4 more)

### Community 59 - "design_system.py"
Cohesion: 0.13
Nodes (20): ansi_ljust(), _detect_page_type(), format_ascii_box(), format_master_md(), format_page_override_md(), _generate_intelligent_overrides(), hex_to_ansi(), persist_design_system() (+12 more)

### Community 60 - "Routing by Task Type"
Cohesion: 0.10
Nodes (19): Banner Design Tasks, Brand Identity Tasks, Component Creation, Corporate Identity Program Tasks, Design Routing Guide, Design System Migration, Icon Design Tasks, Implementation Tasks (+11 more)

### Community 61 - "generate-slide.py"
Cohesion: 0.15
Nodes (19): _e(), generate_chart_slide(), generate_cta_slide(), generate_deck(), generate_metrics_slide(), generate_problem_slide(), generate_solution_slide(), generate_testimonial_slide() (+11 more)

### Community 62 - "shadcn/ui Theming & Customization"
Cohesion: 0.10
Nodes (19): Base Color Presets, Best Practices, Color Customization, Color Format, Component Customization, CSS Variable System, Customize Styles, Customize Variants (+11 more)

### Community 63 - "TailwindConfigGenerator"
Cohesion: 0.10
Nodes (11): Generate Tailwind CSS configuration files., Add full color palette (50-950 shades) for a base color.          Args:, TailwindConfigGenerator, Test adding full color palette., Test adding custom spacing., Test plugin recommendations for Next.js., Test validating config with no content paths., Test writing configuration to file. (+3 more)

### Community 64 - "Asset Organization Guide"
Cohesion: 0.11
Nodes (18): Asset Entry (manifest.json), Asset Organization Guide, By Campaign, By Status, By Type, Cleanup Workflow, Components, Directory Structure (+10 more)

### Community 65 - "Primary Color Meanings"
Cohesion: 0.11
Nodes (18): Accessibility Considerations, Analogous, Black, Blue, Color Combinations by Industry, Color Harmony Types, Complementary, Green (+10 more)

### Community 66 - "Core Logo Types"
Cohesion: 0.11
Nodes (18): 1. Wordmark (Logotype), 2. Lettermark (Monogram), 3. Pictorial Mark (Brand Mark), 4. Abstract Mark, 5. Mascot, 6. Emblem, 7. Combination Mark, Aesthetic Styles (+10 more)

### Community 67 - "Brand Consistency Checklist"
Cohesion: 0.11
Nodes (17): Audit Frequency, Brand Consistency Checklist, Channel Audit, Collateral, Colors, Common Issues, Email, Imagery (+9 more)

### Community 68 - "CIP Mockup Prompt Engineering"
Cohesion: 0.11
Nodes (17): Apparel (Polo/T-Shirt), Base Prompt Structure, Business Card, CIP Mockup Prompt Engineering, Context Modifiers, Corporate Minimal, Deliverable-Specific Modifiers, Letterhead (+9 more)

### Community 69 - "fetch-background.py"
Cohesion: 0.17
Nodes (17): generate_css_for_background(), get_background_image(), get_curated_images(), get_overlay_css(), get_pexels_search_url(), load_backgrounds_config(), load_brand_colors(), main() (+9 more)

### Community 70 - "Design Principles"
Cohesion: 0.12
Nodes (15): 22 Art Direction Styles, Banner Sizes & Art Direction Styles Reference, Complete Banner Sizes, CTA Rules, Design Principles, Pinterest Research Queries, Print, Print Specs (+7 more)

### Community 71 - "Design Principles"
Cohesion: 0.12
Nodes (15): 22 Art Direction Styles, Banner Sizes & Art Direction Styles Reference, Complete Banner Sizes, CTA Rules, Design Principles, Pinterest Research Queries, Print, Print Specs (+7 more)

### Community 72 - "generate.py"
Cohesion: 0.20
Nodes (15): apply_color(), apply_viewbox_size(), extract_svgs(), generate_batch(), generate_icon(), generate_sizes(), load_env(), main() (+7 more)

### Community 73 - "fontSize"
Cohesion: 0.12
Nodes (16): $type, $value, $type, $value, $type, $value, $type, $value (+8 more)

### Community 74 - "TestShadcnInstaller"
Cohesion: 0.12
Nodes (9): Test adding components without shadcn config., Test adding components that are already installed., Test ShadcnInstaller class., Test adding all components in dry run mode., Create temporary project structure., Test successful addition of all components., Test listing installed components when none exist., Test checking for non-existent shadcn config. (+1 more)

### Community 75 - "_palette_is_dark"
Cohesion: 0.17
Nodes (7): _palette_is_dark(), WCAG relative luminance of a #RRGGBB string, or None if unparseable., True when a colors.csv row's Background is a dark surface., _relative_luminance(), The exact reproduction from issue #428., TestEndToEndCoherence, TestLuminance

### Community 76 - "CIP Design Reference"
Cohesion: 0.13
Nodes (14): CIP Brief (Start Here), CIP Design Reference, Commands, Deliverable Categories, Design Styles, Detailed References, Generate Mockups, HTML Presentation Features (+6 more)

### Community 77 - "Icon Design Reference"
Cohesion: 0.13
Nodes (14): Available Styles, CLI Options, Commands, Generate Batch Variations, Generate Multiple Sizes, Generate Single Icon, Icon Categories, Icon Design Reference (+6 more)

### Community 78 - "Copywriting Formulas"
Cohesion: 0.13
Nodes (14): AIDA (Attention-Interest-Desire-Action), Before-After-Bridge, Contrast Patterns, Copywriting Formulas, Core Formulas, Cost of Inaction, FAB (Features-Advantages-Benefits), Formula-to-Slide Mapping (+6 more)

### Community 79 - "Copywriting Formulas"
Cohesion: 0.13
Nodes (14): AIDA (Attention-Interest-Desire-Action), Before-After-Bridge, Contrast Patterns, Copywriting Formulas, Core Formulas, Cost of Inaction, FAB (Features-Advantages-Benefits), Formula-to-Slide Mapping (+6 more)

### Community 80 - "main"
Cohesion: 0.13
Nodes (8): main(), Add custom font families.          Args:             fonts: Dict of font_type: [, Add custom spacing values.          Args:             spacing: Dict of name: val, Add custom breakpoints.          Args:             breakpoints: Dict of name: wi, Add plugin requirements.          Args:             plugins: List of plugin name, Get plugin recommendations based on configuration.          Returns:, Validate configuration.          Returns:             Tuple of (valid, message), Add custom colors to theme.          Args:             colors: Dict of color_nam

### Community 81 - "Banner Design - Multi-Format Creative Banner System"
Cohesion: 0.14
Nodes (13): Art Direction Styles (Top 10), Banner Design - Multi-Format Creative Banner System, Banner Size Quick Reference, Design Rules, Prerequisites, Security, Step 1: Gather Requirements (AskUserQuestion), Step 2: Research & Art Direction (+5 more)

### Community 82 - "Messaging Framework"
Cohesion: 0.14
Nodes (13): Core Statements, Elevator Pitches, Framework Structure, Message Architecture, Message by Audience, Message Testing, Messaging Framework, Mission Statement (+5 more)

### Community 83 - "Brand Voice Framework"
Cohesion: 0.14
Nodes (13): Brand Voice Framework, Character Spectrum, Emotion Spectrum, Language Spectrum, Step 1: Define Personality Traits, Step 2: Create Voice Chart, Step 3: Context Adaptation, Tone Spectrum (+5 more)

### Community 84 - "Layout Patterns"
Cohesion: 0.14
Nodes (13): Card Styles, Component Variants, CSS Structures, Feature Grid (3 columns), Layout Decision Flow, Layout Patterns, Layout Selection by Use Case, Metric Styles (+5 more)

### Community 85 - "Tailwind Integration"
Cohesion: 0.14
Nodes (13): Animation Tokens, Base Layer, Button Example, Component Classes, CSS Variables Setup, Dark Mode Toggle, HSL Format Benefits, shadcn/ui Alignment (+5 more)

### Community 86 - "Layout Patterns"
Cohesion: 0.14
Nodes (13): Card Styles, Component Variants, CSS Structures, Feature Grid (3 columns), Layout Decision Flow, Layout Patterns, Layout Selection by Use Case, Metric Styles (+5 more)

### Community 87 - "pending.js"
Cohesion: 0.26
Nodes (12): clearPending(), ensureStateFile(), fs, getAllPending(), getPending(), { Logger }, path, PENDING_FILE (+4 more)

### Community 88 - "update.md"
Cohesion: 0.15
Nodes (12): Color Presets, Examples, Files Modified, Important, Overview, Skills Used, Step 1: Gather Brand Input, Step 2: Update Brand Guidelines (+4 more)

### Community 89 - "Logo Design Reference"
Cohesion: 0.15
Nodes (12): Available Styles, Color Psychology, Commands, Design Brief (Start Here), Detailed References, Generate Logo, Industry Defaults, Logo Design Reference (+4 more)

### Community 90 - ".add_components"
Cohesion: 0.22
Nodes (7): main(), Add all available shadcn/ui components.          Args:             overwrite: If, List installed components.          Returns:             Tuple of (success, mess, Check if shadcn is initialized in project.          Returns:             True if, Get list of already installed components.          Returns:             List of, Read shadcn version from project package.json; fall back to a pinned default., Add shadcn/ui components.          Args:             components: List of compone

### Community 91 - "ShadcnInstaller"
Cohesion: 0.17
Nodes (7): Handle shadcn/ui component installation., ShadcnInstaller, Test component addition with subprocess error., Test listing installed components when they exist., Test initialization with custom project root., Test checking for existing shadcn config., Test getting installed components without config.

### Community 92 - ".generate_config_string"
Cohesion: 0.20
Nodes (6): Generate configuration file content.          Returns:             Configuration, Generate TypeScript configuration., Generate JavaScript configuration., Format plugins array for config.          Validates each plugin name against a s, Add indentation to JSON string., Write configuration to file.          Returns:             Tuple of (success, me

### Community 93 - "Core Visual Elements"
Cohesion: 0.18
Nodes (10): Color Palette, Colors, Core Visual Elements, Logo, Logo, Quick Checks, Typography, Typography (+2 more)

### Community 94 - "CIP Design Style Guide"
Cohesion: 0.18
Nodes (10): Bold Dynamic, CIP Design Style Guide, Classic Traditional, Color Psychology, Corporate Minimal, Fresh Modern, Luxury Premium, Modern Tech (+2 more)

### Community 95 - "primitive"
Cohesion: 0.20
Nodes (10): fast, normal, slow, $type, $value, $type, $value, duration (+2 more)

### Community 96 - "test_tailwind_config_gen.py"
Cohesion: 0.20
Nodes (7): Tests for tailwind_config_gen.py, Reduce a generated TS/JS config to a bare assignable object so it can be     han, Regression guard for the missing-comma bug between the ``theme`` block and     `, The property preceding ``plugins`` must end with a comma (pure-Python         ch, The emitted config parses as valid JS via ``node --check``., _strip_to_object(), TestGeneratedConfigIsValidJs

### Community 97 - "_resolve_color_mode"
Cohesion: 0.24
Nodes (7): _query_wants_dark(), True when a styles.csv row describes itself as dark-first., True when the query explicitly asks for a dark theme., Resolve the mode the rest of the output has to agree with., _resolve_color_mode(), _style_is_dark_primary(), TestModeResolution

### Community 98 - "._base_config"
Cohesion: 0.22
Nodes (6): Any, Path, Initialize generator.          Args:             typescript: If True, generate ., Determine default output path., Create base configuration structure., Get default content paths for framework.

### Community 99 - "Brand"
Cohesion: 0.20
Nodes (9): Brand, Brand Sync Workflow, Quick Start, References, Routing, Scripts, Subcommands, Templates (+1 more)

### Community 100 - "Slide Strategies"
Cohesion: 0.20
Nodes (9): Common Structures, Duarte Sparkline Pattern, Matching Strategy to Context, Product Demo (6 slides), Sales Pitch (9 slides), Search Commands, Slide Strategies, Strategy Selection (+1 more)

### Community 101 - "generate.py"
Cohesion: 0.29
Nodes (9): enhance_prompt(), generate_batch(), generate_logo(), load_env(), main(), Enhance the logo prompt with style and industry modifiers, Generate a logo using Gemini models with image generation      Args:         asp, Generate multiple logo variants with different styles (+1 more)

### Community 102 - "Slide Strategies"
Cohesion: 0.20
Nodes (9): Common Structures, Duarte Sparkline Pattern, Matching Strategy to Context, Product Demo (6 slides), Sales Pitch (9 slides), Search Commands, Slide Strategies, Strategy Selection (+1 more)

### Community 103 - "Plan: Sistem Config "Class Perks" — Toggle Semua Perk"
Cohesion: 0.20
Nodes (9): Data Model — `DEFAULT_CONFIG` (app.js baris 151), Fase opsional (tidak di fase 1), Goal, Helper `applyPerks()` (app.js), Perubahan file, Plan: Sistem Config "Class Perks" — Toggle Semua Perk, `readConfig()` & `saveConfig()`, UI — Section "🃏 Class Perks" (app.js, setelah section Generate ~baris 402) (+1 more)

### Community 104 - "_run"
Cohesion: 0.28
Nodes (8): CompletedProcess, Path, Regression tests for validate-tokens.cjs.  The validator used to skip any line c, A hardcoded hex on the same line as a var() token is still a violation., A line that references only tokens produces no false positives., _run(), test_flags_hardcoded_hex_sharing_line_with_token(), test_token_only_line_reports_no_violation()

### Community 105 - "retry.js"
Cohesion: 0.24
Nodes (11): claimDailyReward(), { isTransientError }, { Logger }, puppeteer, getErrorCode(), isTransientError(), { Logger }, sleep() (+3 more)

### Community 106 - "radius"
Cohesion: 0.24
Nodes (10): $type, $value, $type, $value, primitive, radius, shadow, full (+2 more)

### Community 107 - "Slides Reference"
Cohesion: 0.29
Nodes (6): Key Features, Knowledge Base, Slides Reference, Usage, When to Use, Workflow

### Community 108 - "HTML Slide Template"
Cohesion: 0.29
Nodes (6): Animation Classes, Background Images, Base Structure, Chart.js Integration, CSS Variables Reference, HTML Slide Template

### Community 109 - "HTML Slide Template"
Cohesion: 0.29
Nodes (6): Animation Classes, Background Images, Base Structure, Chart.js Integration, CSS Variables Reference, HTML Slide Template

### Community 110 - "_filter_anti_patterns_for_mode"
Cohesion: 0.43
Nodes (3): _filter_anti_patterns_for_mode(), Drop "avoid dark mode" advice once dark mode is the resolved answer., TestAntiPatternGating

### Community 111 - "generate_design_system"
Cohesion: 0.29
Nodes (5): format_markdown(), generate_design_system(), Format design system as markdown., Main entry point for design system generation.      Args:         query: Search, TestPersistence

### Community 112 - "_select_palette_for_mode"
Cohesion: 0.43
Nodes (3): Pick the highest-ranked palette matching the resolved mode.      Only the dark c, _select_palette_for_mode(), TestPaletteSelection

### Community 113 - "alert.js"
Cohesion: 0.33
Nodes (6): axios, https, httpsAgent, { Logger }, sendAlert(), stripEmoji()

### Community 114 - "shadow"
Cohesion: 0.60
Nodes (5): sm, sm, sm, $type, $value

### Community 115 - "Slides"
Cohesion: 0.33
Nodes (5): References (Knowledge Base), Routing, Slides, Subcommands, When to Use

### Community 116 - "Brand Guidelines Template"
Cohesion: 0.40
Nodes (4): Brand Guidelines Template, Document Structure, Extractable Fields, Usage

### Community 117 - "lg"
Cohesion: 0.60
Nodes (5): lg, $type, $value, lg, lg

### Community 118 - "xl"
Cohesion: 0.67
Nodes (4): xl, xl, $type, $value

### Community 119 - "md"
Cohesion: 0.07
Nodes (26): CONFIG, executeMockSession(), puppeteer, runMockBot(), author, dependencies, puppeteer, description (+18 more)

### Community 120 - "none"
Cohesion: 0.67
Nodes (4): $type, $value, none, none

### Community 121 - "validate_data.py"
Cohesion: 0.83
Nodes (3): _check_file(), main(), _read_rows()

### Community 150 - "default"
Cohesion: 0.67
Nodes (4): $type, $value, default, default

## Knowledge Gaps
- **1017 isolated node(s):** `$schema`, `file:///D:/Investation/.kilo/plugins/graphify.js`, `snapshot`, `$schema`, `$value` (+1012 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **41 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `primitive` connect `radius` to `spacing`, `fontSize`, `File Changes`, `color`, `primitive`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `BM25` connect `BM25` to `DesignSystemGenerator`, `generate_design_system`, `search`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Are the 36 inferred relationships involving `TailwindConfigGenerator` (e.g. with `TestGeneratedConfigIsValidJs` and `.test_node_check_parses_generated_config()`) actually correct?**
  _`TailwindConfigGenerator` has 36 INFERRED edges - model-reasoned connections that need verification._
- **Are the 23 inferred relationships involving `ShadcnInstaller` (e.g. with `TestShadcnInstaller` and `.test_add_all_components_dry_run()`) actually correct?**
  _`ShadcnInstaller` has 23 INFERRED edges - model-reasoned connections that need verification._
- **Are the 16 inferred relationships involving `DesignSystemGenerator` (e.g. with `TestDomainDetection` and `TestPersistence`) actually correct?**
  _`DesignSystemGenerator` has 16 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `file:///D:/Investation/.kilo/plugins/graphify.js`, `snapshot` to the rest of the system?**
  _1017 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `logger.js` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._