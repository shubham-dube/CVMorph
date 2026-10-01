# Copious Brand Assets Inventory

This inventory documents all official brand assets provided for **Copious** / **My Copious** across three designated reference directories on the workstation.

> [!IMPORTANT]
> In accordance with Task 1 constraints, these assets are **cataloged for reference only** and have **NOT** been copied into the repository during this task. They will be integrated in Task 4 (Design System) and Task 5 (Core UI Components).

---

## 1. Brand Palette & Color Identity

From automated pixel and vector analysis of the official assets, Copious's primary brand identity is built around a distinct dual-green / teal harmony paired with high-contrast monochromes:

| Color Name | Hex Code | RGB | Sample Variant / Usage | Role in Design System |
|---|---|---|---|---|
| **Copious Emerald Teal** | `#01AA83` | `rgb(1, 170, 131)` | Main logo wordmark, filled 'P' mark, primary headers | **Primary Brand Color** (Buttons, active states, key headings) |
| **Copious Mint Teal** | `#48D7AC` | `rgb(72, 215, 172)` | Light accents, secondary brand mark, badges | **Secondary / Accent Color** (Highlights, badges, hover rings) |
| **Pure White** | `#FFFFFF` | `rgb(255, 255, 255)` | Inverted wordmark, dark-mode icons | **Surface Light / Text Primary (Dark Mode)** |
| **Deep Obsidian** | `#08090D` / `#000000` | `rgb(8, 9, 13)` | Dark backgrounds, drop shadows, contrasting fills | **Background Dark / Text Primary (Light Mode)** |

*Critical Discrepancy Found in App:* The current codebase uses purple design tokens (`#8b7cf6` and `#6d5bd0` in [apps/web/app/globals.css](file:///d:/Projects/Resume_Formatter/apps/web/app/globals.css#L23-L27)) which conflict with Copious's brand palette.

---

## 2. General Use Logos & Brand Marks

**Source Location:** `C:\Users\itzsh\Downloads\Logo & Brand Mark - General Use-20261001T182442Z-1-001\Logo & Brand Mark - General Use`

| File Name | Format | Dimensions | Color Scheme | Variant | Usefulness for Web Application |
|---|---|---|---|---|---|
| `01AA83 - Background.png` | PNG | 7500 × 3114 | `#01aa83` dominant | Wordmark with background | Medium (Marketing banners, print collateral) |
| `01AA83 - Background.svg` | SVG | Vector | `#01aa83` | Vector wordmark with bg | High (Can be tailored for hero displays) |
| `01AA83 - Filled P.png` | PNG | 2000 × 2664 | `#01aa83`, `#000000` | Mark: Solid stylized 'P' icon | High (Favicons, mobile header icon, loading spinner) |
| `01AA83 - Filled P.svg` | SVG | Vector | `#01aa83`, `#000000` | Mark: Solid stylized 'P' icon | **CRITICAL** (Perfect for responsive Topbar & Sidebar brand mark) |
| `01AA83 - Filled P.pdf` | PDF | Vector | `#01aa83` | Print-ready icon | Low for web |
| `01AA83 - No Shadow.png` | PNG | 5500 × 1113 | `#01aa83`, `#000000` | Full Horizontal Wordmark | High (Login screen, documentation headers) |
| `01AA83 - No Shadow.svg` | SVG | Vector | `#01aa83`, `#000000` | Full Horizontal Wordmark | **CRITICAL** (Main desktop navigation brand logo) |
| `01AA83 - No Shadow.pdf` | PDF | Vector | `#01aa83` | Vector print wordmark | Low for web |
| `01AA83 - Outline P.png` | PNG | 2000 × 2673 | `#01aa83`, `#000000` | Mark: Outline 'P' | Medium (Secondary brand mark) |
| `01AA83 - Outline P.svg` | SVG | Vector | `#01aa83` | Mark: Outline 'P' | High (Wireframe mode, ghost badges) |
| `48D7AC - Background.png` | PNG | 7500 × 3114 | `#48d7ac`, `#ffffff` | Mint background wordmark | Medium (Marketing promo) |
| `48D7AC - Background.svg` | SVG | Vector | `#48d7ac` | Mint background vector | Medium |
| `48D7AC - Filled P.png` | PNG | 2000 × 2664 | `#48d7ac`, `#000000` | Mark: Mint solid 'P' | High (Dark-theme glowing icon) |
| `48D7AC - Filled P.svg` | SVG | Vector | `#48d7ac` | Mark: Mint solid 'P' | **CRITICAL** (Ideal for dark mode sidebar brand logo) |
| `48D7AC - No Shadow.png` | PNG | 5500 × 1113 | `#000000`, `#48d7ac` | Mint horizontal wordmark | High (Dark theme top bar) |
| `48D7AC - No Shadow.svg` | SVG | Vector | `#000000`, `#48d7ac` | Mint horizontal vector | **CRITICAL** (High-contrast dark-mode brand logo) |
| `48D7AC - Outline P.png` | PNG | 2000 × 2673 | `#000000`, `#48d6ac` | Mark: Mint outline 'P' | Medium |
| `48D7AC - Outline P.svg` | SVG | Vector | `#48d6ac` | Mark: Mint outline 'P' | High (Interactive hover states) |
| `White - Filled P.png` | PNG | 2000 × 2673 | `#ffffff`, `#000000` | Mark: Pure white 'P' | High (Dark mode monochrome icon) |
| `White - Filled P.svg` | SVG | Vector | `#ffffff` | Mark: Pure white 'P' | High (Monochrome icon, footer mark) |
| `White - Outline P.png` | PNG | 2000 × 2673 | `#000000`, `#ffffff` | Mark: Pure white outline | Medium |
| `White - Outline P.svg` | SVG | Vector | `#ffffff` | Mark: Pure white outline | High (Ghost mark on colored cards) |
| `White Only Logo.png` | PNG | 5500 × 1113 | `#ffffff`, `#000000` | Horizontal pure white wordmark | High (Dark theme full wordmark) |
| `White Only Logo.svg` | SVG | Vector | `#ffffff` | Horizontal pure white vector | **CRITICAL** (Universal white logo for dark theme) |
| `Copious Logo.eps` | EPS | Vector (8.2 MB)| Print standard | Master Illustrator vector | For high-res vector extraction |

---

## 3. Social Media & App Avatar Assets

**Source Location:** `C:\Users\itzsh\Downloads\Logo & Brand Mark - Social Media Use-20261001T182442Z-1-001\Logo & Brand Mark - Social Media Use`

All items in this directory are 1:1 square aspect ratios formatted for avatars, app icons, and social media tiles:

| File Name | Format | Dimensions | Dominant Colors | Variant Details | App Recommendation |
|---|---|---|---|---|---|
| `Copious - Profile Icon - 01AA83.png` | PNG | 1080 × 1080 | `#01aa83`, `#000000` | Square emerald tile with black mark | Excellent for app favicon & PWA icon |
| `Copious - Profile Icon - 48D7AC.png` | PNG | 1080 × 1080 | `#48d7ac`, `#000000` | Square mint tile with dark mark | Alternative app icon |
| `Copious - Profile Icon - Black.png` | PNG | 1080 × 1080 | `#000000`, `#01aa83` | Black square with emerald mark | **Ideal for dark-mode web favicon (`favicon.ico`)** |
| `Copious - Profile Icon - White.png` | PNG | 1080 × 1080 | `#ffffff`, `#01aa83` | White square with emerald mark | **Ideal for light-mode web favicon** |
| `Copious - Social Media Icon - 01AA83 - Filled P.png` | PNG | 1080 × 1080 | `#01aa83`, `#ffffff` | Emerald tile with white filled 'P' | Auth screen social badge |
| `Copious - Social Media Icon - 01AA83 - Outline P.png`| PNG | 1080 × 1080 | `#01aa83`, `#ffffff` | Emerald tile with white outline 'P'| Secondary badge |
| `Copious - Social Media Icon - 48D7AC - Filled P.png` | PNG | 1080 × 1080 | `#48d7ac`, `#000000` | Mint tile with dark filled 'P' | Accent avatar |
| `Copious - Social Media Icon - 48D7AC - Outline P.png`| PNG | 1080 × 1080 | `#48d7ac`, `#000000` | Mint tile with dark outline 'P' | Accent avatar |
| `Copious - Social Media Icon - Black - 01AA83 Filled P.png` | PNG | 1080 × 1080 | `#000000`, `#01aa83` | Dark obsidian tile, emerald mark | Topbar user profile fallback / org icon |
| `Copious - Social Media Icon - White - 01AA83 Filled P.png` | PNG | 1080 × 1080 | `#ffffff`, `#01aa83` | Clean white tile, emerald mark | Light theme org icon |

---

## 4. Banners & Email Signature Collateral

**Source Location:** `C:\Users\itzsh\Downloads\Banners`

| File Name | Format | Dimensions | Dominant Colors | Content / Theme | App Recommendation |
|---|---|---|---|---|---|
| `Email Signature Banner.gif` | GIF | 500 × 120 | Animated multi-color | Copious consulting email signature | Reference for animations / micro-interactions |
| `LinkedIn Banner - 1128 x 191.png` | PNG | 1128 × 191 | `#000000`, `#01aa83` | Horizontal LinkedIn header | Reference for banner aspect ratios |
| `LinkedIn Banner - 1584 x 396 - Personal Page.png` | PNG | 1584 × 396 | `#000000`, `#01aa83` | Personal recruiter banner | Reference for recruiter portal theming |
| `LinkedIn Banner - Company Page - 2026.png` | PNG | 1584 × 396 | `#000000`, `#01aa83`, `#48d7ac` | Official 2026 brand banner | Brand hero header on Login page |
| `LinkedIn Banner - Copious 10th Anniversary - Company Page.png` | PNG | 1584 × 396 | `#000000`, `#d4af37` (Gold), `#01aa83` | 10th Anniversary commemorative | Reference for anniversary badges |
| `LinkedIn Banner - Copious 10th Anniversary - Personal Page.png` | PNG | 1584 × 396 | `#000000`, `#d4af37` (Gold), `#01aa83` | 10th Anniversary personal | Reference |
| `zap - LinkedIn Banner - Company Page - 2026.png` | PNG | 1584 × 396 | `#000000`, `#01aa83` | High-energy tech variant | Auth screen left-panel background graphic |

---

## 5. Assets Recommended for Direct Integration in Task 4 & Task 5

When creating the design system and UI components, the following files should be copied into `apps/web/public/brand/`:

1. **`01AA83 - Filled P.svg`** → `public/brand/copious-mark-emerald.svg` (Primary app logo mark).
2. **`48D7AC - Filled P.svg`** → `public/brand/copious-mark-mint.svg` (Dark theme app logo mark).
3. **`White - Filled P.svg`** → `public/brand/copious-mark-white.svg` (Monochrome white logo mark).
4. **`01AA83 - No Shadow.svg`** → `public/brand/copious-wordmark-emerald.svg` (Full horizontal brand logo for light mode).
5. **`White Only Logo.svg`** → `public/brand/copious-wordmark-white.svg` (Full horizontal brand logo for dark mode).
6. **`Copious - Profile Icon - Black.png`** → `public/favicon.ico` & `public/brand/app-icon-192.png` (High-DPI favicon & PWA icon).
