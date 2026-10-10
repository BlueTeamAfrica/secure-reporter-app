<?php
// ================================================================
// SUDAN FACTS — Global Site Header v2
// Suppresses Kadence header sitewide + injects custom header
// Includes: animated Africa/Sudan SVG, GIJN-inspired mobile drawer
// ================================================================

// ── 1. Suppress Kadence header on ALL pages ──────────────────────

add_action('wp_head', function() {
    echo '<style id="sf-kadence-suppress">
        .site-header, header.site-header, #masthead, #site-header,
        .kadence-sticky-header-wrap, .site-branding, .site-title,
        .wp-site-blocks > header { display: none !important; }
        .site-main, #main, .content-container {
            padding-top: 0 !important;
            margin-top: 0 !important;
        }
        html:not(.admin-bar) { margin-top: 0 !important; }
        #wpadminbar { box-shadow: none !important; }
        body.home { padding-top: 0 !important; }
        #wpadminbar { position: fixed !important; }
        .admin-bar #sf-header { top: 32px; }
        @media screen and (max-width: 782px) {
            .admin-bar #sf-header { top: 46px; }
        }
        .home .entry-header,
        .home .page-header,
        .home h1.entry-title,
        .home .wp-block-post-title { display: none !important; }
    </style>';
}, 1);

add_action('wp_head', function() {
    echo '<script>(function(){ if(window.location.pathname === "/") document.documentElement.classList.add("sf-is-home"); })();</script>';
}, 2);

// ── 2. Header CSS ─────────────────────────────────────────────────
add_action('wp_head', function() {
    add_filter('body_class', function($classes) {
        if (is_front_page()) $classes[] = 'sf-is-home';
        return $classes;
    });
?>
<style id="sf-header-css">
#sf-header *, #sf-hdr-drawer *, #sf-hdr-search * {
    box-sizing: border-box; margin: 0; padding: 0;
}

/* ── Base ── */
#sf-header {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 9999;
    height: 72px;
    background: transparent;
    transition: background 0.35s ease, box-shadow 0.35s ease;
    font-family: 'Poppins', sans-serif;
}
#sf-header.sf-scrolled {
    background: rgba(14,14,14,0.96) !important;
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    box-shadow: 0 1px 0 rgba(255,255,255,0.07);
}
#sf-hdr-inner {
    max-width: 1320px;
    margin: 0 auto;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 52px;
    position: relative;
}
body:not(.sf-is-home) { padding-top: 72px; }

/* ── Logo group ── */
#sf-hdr-logo-group {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-shrink: 0;
    text-decoration: none;
}
#sf-hdr-logo {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    text-decoration: none;
}
#sf-hdr-logo img {
    height: 34px;
    width: auto;
    display: block;
    transition: filter 0.35s ease;
    filter: none;
}
.sf-is-home #sf-header:not(.sf-scrolled) #sf-hdr-logo img { filter: invert(1) brightness(10); }
#sf-header.sf-scrolled #sf-hdr-logo img { filter: invert(1) brightness(10); }

/* ── Africa SVG divider ── */
#sf-hdr-logo-sep {
    width: 1px;
    height: 28px;
    background: rgba(255,255,255,0.2);
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.35s, background 0.35s;
}
.sf-is-home #sf-header:not(.sf-scrolled) #sf-hdr-logo-sep { opacity: 1; background: rgba(255,255,255,0.2); }
#sf-header.sf-scrolled #sf-hdr-logo-sep { opacity: 1; background: rgba(255,255,255,0.2); }
body:not(.sf-is-home) #sf-header:not(.sf-scrolled) #sf-hdr-logo-sep { opacity: 1; background: rgba(26,26,26,0.15); }

/* ── Africa SVG ── */
@keyframes sf-africa-breathe {
    0%, 100% { transform: scale(1); }
    50%       { transform: scale(1.04); }
}
@keyframes sf-africa-breathe-hover {
    to { transform: scale(1.06); }
}
#sf-africa-svg {
    width: 32px;
    height: 38px;
    flex-shrink: 0;
    display: block;
    overflow: visible;
    transform-origin: center;
    animation: sf-africa-breathe 4s ease-in-out infinite;
    cursor: default;
}
#sf-africa-svg:hover {
    animation: sf-africa-breathe-hover 0.3s ease forwards;
}

/* Legacy inline-SVG classes (kept for fallback) */
.sf-africa-continent {
    fill: rgba(255,255,255,0.15);
    transition: fill 0.35s;
}
.sf-is-home #sf-header:not(.sf-scrolled) .sf-africa-continent { fill: rgba(255,255,255,0.18); }
#sf-header.sf-scrolled .sf-africa-continent { fill: rgba(255,255,255,0.18); }
#sf-header:not(.sf-scrolled):not(.sf-is-home-hdr) .sf-africa-continent { fill: rgba(26,26,26,0.18); }
.sf-sudan-path {
    fill: #C0392B;
    transform-origin: 16px 15px;
    animation: sf-sudan-pulse 3s ease-in-out infinite;
}
@keyframes sf-sudan-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.65; }
}

/* ── Centered tagline ── */
#sf-hdr-tagline {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    font-family: 'Poppins', sans-serif;
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(26,26,26,0.35);
    white-space: nowrap;
    pointer-events: none;
    transition: color 0.35s;
    z-index: 1;
}
.sf-is-home #sf-header:not(.sf-scrolled) #sf-hdr-tagline,
#sf-header.sf-scrolled #sf-hdr-tagline {
    color: rgba(255,255,255,0.35);
}

/* ── Nav links ── */
#sf-hdr-nav {
    display: flex;
    align-items: center;
    gap: 28px;
    margin-left: 20px;
}
#sf-hdr-nav > a,
.sf-hdr-dd-btn {
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.02em;
    text-decoration: none;
    color: #1a1a1a;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: color 0.2s;
    font-family: 'Poppins', sans-serif;
    white-space: nowrap;
}
.sf-is-home #sf-header:not(.sf-scrolled) #sf-hdr-nav > a,
.sf-is-home #sf-header:not(.sf-scrolled) .sf-hdr-dd-btn,
#sf-header.sf-scrolled #sf-hdr-nav > a,
#sf-header.sf-scrolled .sf-hdr-dd-btn {
    color: rgba(255,255,255,0.82) !important;
}
#sf-hdr-nav > a:hover,
.sf-hdr-dd-btn:hover,
#sf-hdr-nav > a.sf-active { color: #C0392B !important; }
.sf-is-home #sf-header:not(.sf-scrolled) #sf-hdr-nav > a.sf-active,
#sf-header.sf-scrolled #sf-hdr-nav > a.sf-active { color: #C0392B !important; }

/* ── Dropdown wrapper ── */
.sf-hdr-dd { position: relative; }
.sf-hdr-dd-chevron {
    width: 12px; height: 12px;
    stroke: currentColor; fill: none;
    stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
    transition: transform 0.25s;
    flex-shrink: 0;
}
.sf-hdr-dd.open .sf-hdr-dd-chevron { transform: rotate(180deg); }

/* ── Mega Menu Panel ── */
.sf-mega-panel {
    position: fixed;
    left: 0; right: 0;
    top: 72px;
    background: #111;
    border-top: 2px solid #C0392B;
    box-shadow: 0 20px 48px rgba(0,0,0,0.55);
    opacity: 0;
    visibility: hidden;
    transform: translateY(-6px);
    transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
    z-index: 9998;
}
.admin-bar .sf-mega-panel { top: 104px; }
@media screen and (max-width: 782px) {
    .admin-bar .sf-mega-panel { top: 118px; }
}
.sf-hdr-dd.open .sf-mega-panel {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
}
.sf-mega-inner {
    max-width: 1100px;
    margin: 0 auto;
    padding: 36px 52px 40px;
    display: grid;
    gap: 0;
}
.sf-mega-programs { grid-template-columns: repeat(4, 1fr); }
.sf-mega-about    { grid-template-columns: repeat(3, 1fr); }
.sf-mega-events   { grid-template-columns: repeat(3, 1fr); }

.sf-mega-col {
    padding-right: 32px;
    border-right: 1px solid rgba(255,255,255,0.06);
    margin-right: 32px;
}
.sf-mega-col:last-child {
    border-right: none;
    margin-right: 0;
    padding-right: 0;
}
.sf-mega-spacer { border-right: none; }

.sf-mega-col a {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 0;
    text-decoration: none;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    transition: opacity 0.15s;
}
.sf-mega-col a:first-child { padding-top: 0; }
.sf-mega-col a:last-child { border-bottom: none; padding-bottom: 0; }
.sf-mega-col a:hover { opacity: 0.75; }
.sf-mega-col a strong {
    display: block;
    font-size: 13px; font-weight: 600;
    color: #fff; margin-bottom: 5px;
    font-family: 'Poppins', sans-serif;
    line-height: 1.2;
}
.sf-mega-col a span.sf-mega-desc {
    display: block; font-size: 11px;
    color: rgba(255,255,255,0.38);
    font-family: 'Poppins', sans-serif;
    line-height: 1.5;
}
.sf-mega-arrow {
    color: rgba(255,255,255,0.28);
    font-size: 14px;
    flex-shrink: 0;
    margin-top: 1px;
    font-family: 'Poppins', sans-serif;
    transition: color 0.15s, transform 0.15s;
}
.sf-mega-col a:hover .sf-mega-arrow {
    color: #C0392B;
    transform: translateX(2px);
}
.sf-mega-all a strong {
    color: rgba(255,255,255,0.45);
    font-size: 12px; font-weight: 500;
}
.sf-mega-all a:hover strong { color: #C0392B; }

/* Legacy simple panel (kept for fallback) */
.sf-hdr-dd-panel {
    position: absolute;
    top: calc(100% + 18px);
    left: 50%;
    transform: translateX(-50%) translateY(-8px);
    min-width: 260px;
    background: #111;
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 8px;
    padding: 8px;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
    box-shadow: 0 20px 48px rgba(0,0,0,0.45);
}
.sf-hdr-dd.open .sf-hdr-dd-panel {
    opacity: 1;
    visibility: visible;
    transform: translateX(-50%) translateY(0);
}
.sf-hdr-dd-panel a {
    display: block;
    padding: 11px 14px;
    border-radius: 6px;
    text-decoration: none;
    transition: background 0.15s;
}
.sf-hdr-dd-panel a:hover { background: rgba(255,255,255,0.06); }
.sf-hdr-dd-panel a strong {
    display: block;
    font-size: 13px; font-weight: 600;
    color: #fff; margin-bottom: 3px;
    font-family: 'Poppins', sans-serif;
}
.sf-hdr-dd-panel a span {
    display: block; font-size: 11px;
    color: rgba(255,255,255,0.42);
    font-family: 'Poppins', sans-serif;
    line-height: 1.4;
}
.sf-hdr-dd-panel a.sf-dd-all strong {
    color: rgba(255,255,255,0.5);
    font-size: 12px; font-weight: 500;
}
.sf-hdr-dd-panel a.sf-dd-all:hover strong { color: #C0392B; }
.sf-hdr-dd-panel::before {
    content: '';
    position: absolute;
    top: -18px; left: 0; right: 0;
    height: 18px;
}

/* ── Actions ── */
#sf-hdr-actions {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-shrink: 0;
}
#sf-hdr-search-btn {
    background: none; border: none; cursor: pointer;
    padding: 4px; color: #1a1a1a;
    display: flex; align-items: center;
    transition: color 0.2s;
}
.sf-is-home #sf-header:not(.sf-scrolled) #sf-hdr-search-btn,
#sf-header.sf-scrolled #sf-hdr-search-btn { color: rgba(255,255,255,0.65); }
#sf-hdr-search-btn:hover { color: #C0392B !important; }
#sf-hdr-search-btn svg {
    width: 17px; height: 17px;
    stroke: currentColor; fill: none;
    stroke-width: 2; stroke-linecap: round;
}
#sf-hdr-lang {
    display: flex; align-items: center; gap: 5px;
    font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
}
#sf-hdr-lang a, #sf-hdr-lang .sf-lang-current {
    text-decoration: none;
    color: rgba(0,0,0,0.4);
    transition: color 0.2s;
    font-family: 'Poppins', sans-serif;
}
#sf-hdr-lang .sf-lang-current { color: #1a1a1a; }
.sf-is-home #sf-header:not(.sf-scrolled) #sf-hdr-lang a,
.sf-is-home #sf-header:not(.sf-scrolled) #sf-hdr-lang .sf-lang-current,
#sf-header.sf-scrolled #sf-hdr-lang a { color: rgba(255,255,255,0.42); }
.sf-is-home #sf-header:not(.sf-scrolled) #sf-hdr-lang .sf-lang-current,
#sf-header.sf-scrolled #sf-hdr-lang .sf-lang-current { color: #fff; }
#sf-hdr-lang a:hover { color: #C0392B !important; }
#sf-hdr-lang-sep { color: rgba(0,0,0,0.18); font-weight: 300; font-size: 12px; }
.sf-is-home #sf-header:not(.sf-scrolled) #sf-hdr-lang-sep,
#sf-header.sf-scrolled #sf-hdr-lang-sep { color: rgba(255,255,255,0.2); }
#sf-hdr-donate {
    font-size: 12px; font-weight: 600; letter-spacing: 0.04em;
    color: #fff !important; background: #C0392B;
    padding: 9px 20px; border-radius: 4px;
    text-decoration: none !important;
    transition: background 0.2s, transform 0.15s;
    white-space: nowrap; flex-shrink: 0;
    font-family: 'Poppins', sans-serif;
}
#sf-hdr-donate:hover { background: #a93226; transform: translateY(-1px); }

/* ── Burger ── */
#sf-hdr-burger {
    display: none; background: none; border: none;
    cursor: pointer; padding: 4px;
    flex-direction: column; gap: 5px;
    align-items: center; justify-content: center;
}
#sf-hdr-burger span {
    display: block; width: 22px; height: 2px;
    background: #1a1a1a;
    transition: background 0.2s, transform 0.3s, opacity 0.3s;
    transform-origin: center;
}
.sf-is-home #sf-header:not(.sf-scrolled) #sf-hdr-burger span,
#sf-header.sf-scrolled #sf-hdr-burger span { background: #fff; }
#sf-hdr-burger.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
#sf-hdr-burger.open span:nth-child(2) { opacity: 0; transform: scaleX(0); }
#sf-hdr-burger.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

/* ── GIJN-style Full-screen Mobile Drawer ── */
#sf-hdr-drawer {
    position: fixed;
    inset: 0;
    background: #0e0e0e;
    z-index: 9998;
    transform: translateX(100%);
    transition: transform 0.38s cubic-bezier(0.25,0.46,0.45,0.94);
    overflow-y: auto;
    font-family: 'Poppins', sans-serif;
    display: flex;
    flex-direction: column;
}
#sf-hdr-drawer.open { transform: translateX(0); }

#sf-drawer-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 28px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    flex-shrink: 0;
}
#sf-drawer-logo img {
    height: 28px;
    width: auto;
    filter: invert(1) brightness(10);
}
#sf-drawer-close {
    background: none; border: none; cursor: pointer;
    color: rgba(255,255,255,0.6);
    font-family: 'Poppins', sans-serif;
    font-size: 11px; font-weight: 600;
    letter-spacing: 0.12em;
    display: flex; align-items: center; gap: 8px;
    padding: 8px;
    transition: color 0.2s;
}
#sf-drawer-close:hover { color: #fff; }
#sf-drawer-close svg {
    width: 18px; height: 18px;
    stroke: currentColor; fill: none;
    stroke-width: 2; stroke-linecap: round;
}

.sf-drawer-nav {
    flex: 1;
    padding: 12px 0;
}
.sf-drawer-nav > a,
.sf-drawer-acc {
    font-size: 1.125rem;
    font-weight: 600;
    color: rgba(255,255,255,0.82) !important;
    text-decoration: none;
    padding: 18px 28px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: none;
    border-left: none; border-right: none; border-top: none;
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: color 0.2s, background 0.2s;
    font-family: 'Poppins', sans-serif;
}
.sf-drawer-nav > a:hover,
.sf-drawer-acc:hover {
    color: #fff !important;
    background: rgba(255,255,255,0.03);
}
.sf-drawer-nav > a.sf-active { color: #C0392B !important; }
.sf-drawer-arrow {
    width: 18px; height: 18px;
    stroke: currentColor; fill: none;
    stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
    opacity: 0.4;
    transition: transform 0.25s, opacity 0.2s;
    flex-shrink: 0;
}
.sf-drawer-acc.open .sf-drawer-arrow { transform: rotate(90deg); opacity: 0.8; }

.sf-drawer-sub {
    overflow: hidden;
    max-height: 0;
    transition: max-height 0.3s ease;
    background: rgba(255,255,255,0.02);
}
.sf-drawer-sub.open { max-height: 300px; }
.sf-drawer-sub a {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 28px 16px 40px;
    text-decoration: none;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    transition: background 0.15s;
}
.sf-drawer-sub a:hover { background: rgba(255,255,255,0.04); }
.sf-drawer-sub a strong {
    display: block;
    font-size: 0.9375rem;
    font-weight: 600;
    color: rgba(255,255,255,0.8);
    margin-bottom: 3px;
    font-family: 'Poppins', sans-serif;
}
.sf-drawer-sub a span {
    font-size: 11px;
    color: rgba(255,255,255,0.35);
    font-family: 'Poppins', sans-serif;
    line-height: 1.4;
}
.sf-drawer-sub-arrow {
    width: 14px; height: 14px;
    stroke: rgba(255,255,255,0.25); fill: none;
    stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
    flex-shrink: 0;
}

#sf-drawer-bottom {
    padding: 24px 28px 40px;
    border-top: 1px solid rgba(255,255,255,0.07);
    flex-shrink: 0;
}
.sf-drawer-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
}
.sf-drawer-lang {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    font-family: 'Poppins', sans-serif;
}
.sf-drawer-lang a, .sf-drawer-lang .sf-lang-current {
    color: rgba(255,255,255,0.45);
    text-decoration: none;
    transition: color 0.2s;
}
.sf-drawer-lang .sf-lang-current { color: #fff; }
.sf-drawer-lang a:hover { color: #C0392B; }
.sf-drawer-lang-sep { color: rgba(255,255,255,0.2); }
.sf-drawer-donate {
    font-size: 13px;
    font-weight: 700;
    color: #fff !important;
    background: #C0392B;
    padding: 11px 24px;
    border-radius: 4px;
    text-decoration: none !important;
    font-family: 'Poppins', sans-serif;
    transition: background 0.2s;
}
.sf-drawer-donate:hover { background: #a93226; }

.sf-drawer-tagline {
    font-family: 'Poppins', sans-serif;
    font-size: 11px;
    color: rgba(255,255,255,0.2);
    letter-spacing: 0.06em;
}

/* ── Search Overlay ── */
#sf-hdr-search {
    position: fixed; inset: 0;
    background: rgba(10,10,10,0.97);
    z-index: 10000;
    display: flex; align-items: center; justify-content: center;
    opacity: 0; visibility: hidden;
    transition: opacity 0.25s, visibility 0.25s;
}
#sf-hdr-search.open { opacity: 1; visibility: visible; }
#sf-search-form {
    width: 100%; max-width: 680px; padding: 0 24px;
}
#sf-search-form label {
    display: block;
    font-size: 10px; font-weight: 600;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: rgba(255,255,255,0.3);
    font-family: 'Poppins', sans-serif;
    margin-bottom: 18px;
}
#sf-search-input {
    width: 100%; background: none; border: none;
    border-bottom: 1px solid rgba(255,255,255,0.18);
    padding: 12px 0;
    font-size: clamp(28px, 4vw, 52px);
    font-weight: 700; font-family: 'Poppins', sans-serif;
    color: #fff; outline: none; caret-color: #C0392B;
}
#sf-search-input::placeholder { color: rgba(255,255,255,0.12); }
#sf-search-close {
    position: absolute; top: 28px; right: 32px;
    background: none; border: none; cursor: pointer;
    color: rgba(255,255,255,0.35);
    font-size: 11px; font-family: 'Poppins', sans-serif;
    letter-spacing: 0.12em;
    display: flex; align-items: center; gap: 8px;
    transition: color 0.2s;
}
#sf-search-close:hover { color: #fff; }
#sf-search-close svg {
    width: 15px; height: 15px;
    stroke: currentColor; fill: none;
    stroke-width: 2; stroke-linecap: round;
}

/* ── Shared section CSS (homepage sections) ── */
.sf-section-label {
    display: block;
    font-size: 11px; font-weight: 600;
    letter-spacing: 0.15em; color: #c0392b;
    margin-bottom: 16px;
    font-family: 'Poppins', sans-serif;
    text-transform: uppercase;
}
.sf-wwd { background: #0e0e0e; padding: 100px 24px; }
.sf-wwd-inner { max-width: 1200px; margin: 0 auto; }
.sf-wwd-intro {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 64px; align-items: end;
    padding-bottom: 48px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    margin-bottom: 40px;
}
.sf-wwd-intro-left h2 {
    font-family: 'Poppins', sans-serif;
    font-size: clamp(1.875rem, 3.5vw, 2.5rem);
    font-weight: 700; line-height: 1.2; color: #fff; margin: 0;
}
.sf-wwd-intro-right p {
    font-family: 'Poppins', sans-serif;
    font-size: 1rem; line-height: 1.85;
    color: rgba(255,255,255,0.55); margin: 0;
}
.sf-wwd-grid {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 2px; background: rgba(255,255,255,0.07);
}
.sf-wwd-item { background: #0e0e0e; display: flex; flex-direction: column; overflow: hidden; }
.sf-wwd-img { height: 260px; overflow: hidden; flex-shrink: 0; }
.sf-wwd-img img {
    width: 100%; height: 100%; object-fit: cover; display: block;
    filter: grayscale(25%) brightness(0.9);
    transition: filter 0.5s ease, transform 0.6s ease;
}
.sf-wwd-item:hover .sf-wwd-img img { filter: grayscale(0%) brightness(1); transform: scale(1.04); }
.sf-wwd-body { padding: 32px 32px 40px; border-top: 2px solid #c0392b; flex: 1; }
.sf-wwd-num {
    display: block; font-family: 'Poppins', sans-serif;
    font-size: 0.6875rem; font-weight: 700;
    letter-spacing: 0.12em; color: #c0392b;
    margin-bottom: 16px; margin-top: 20px;
}
.sf-wwd-item h3 { font-family: 'Poppins', sans-serif; font-size: 1.125rem; font-weight: 700; color: #fff; margin: 0 0 12px; }
.sf-wwd-item p { font-family: 'Poppins', sans-serif; font-size: 0.9375rem; line-height: 1.75; color: rgba(255,255,255,0.5); margin: 0; }
.sf-ep { background: #f2f0e6; padding: 100px 24px; }
.sf-ep-inner { max-width: 1200px; margin: 0 auto; }
.sf-ep-header { max-width: 680px; margin: 0 auto 64px; text-align: center; }
.sf-ep-header h2 { font-family: 'Poppins', sans-serif; font-size: clamp(1.875rem, 3.5vw, 2.5rem); font-weight: 700; line-height: 1.2; color: #1a1a1a; margin: 0 0 24px; }
.sf-ep-header p { font-family: 'Poppins', sans-serif; font-size: 1rem; line-height: 1.85; color: #54595f; margin: 0; }
.sf-ep-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 3px; background: rgba(0,0,0,0.12); }
.sf-ep-card { position: relative; overflow: hidden; min-height: 340px; display: flex; align-items: flex-end; box-shadow: 0 2px 16px rgba(0,0,0,0.06); transition: box-shadow 0.4s ease; }
.sf-ep-card:hover { box-shadow: 0 8px 40px rgba(0,0,0,0.18); }
.sf-ep-card-bg { position: absolute; inset: 0; background-size: cover; background-position: center; transform: scale(1); transition: transform 0.7s ease; }
.sf-ep-card:hover .sf-ep-card-bg { transform: scale(1.07); }
.sf-ep-card-overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.72) 60%, rgba(0,0,0,0.88) 100%); transition: opacity 0.4s ease; }
.sf-ep-card:hover .sf-ep-card-overlay { opacity: 0.85; }
.sf-ep-card-content { position: relative; z-index: 1; padding: 36px 36px 36px 33px; border-left: 3px solid #c0392b; width: 100%; }
.sf-ep-card-content h3 { font-family: 'Poppins', sans-serif; font-size: 1.125rem; font-weight: 700; color: #fff; margin: 0 0 12px; }
.sf-ep-card-content p { font-family: 'Poppins', sans-serif; font-size: 0.9rem; line-height: 1.75; color: rgba(255,255,255,0.78); margin: 0; }
.sf-programs { background: #0e0e0e; padding: 100px 24px; }
.sf-programs-inner { max-width: 1200px; margin: 0 auto; }
.sf-programs-header { margin-bottom: 56px; }
.sf-programs-header h2 { font-family: 'Poppins', sans-serif; font-size: clamp(1.875rem, 3.5vw, 2.5rem); font-weight: 700; line-height: 1.2; color: #fff; margin: 0; max-width: 560px; }
.sf-programs-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 3px; background: rgba(255,255,255,0.06); }
.sf-program-card { position: relative; overflow: hidden; min-height: 480px; display: flex; align-items: flex-end; transition: box-shadow 0.4s ease; }
.sf-program-card:hover { box-shadow: 0 12px 48px rgba(0,0,0,0.4); }
.sf-program-bg { position: absolute; inset: 0; background-size: cover; background-position: center top; transform: scale(1); transition: transform 0.7s ease; }
.sf-program-card:hover .sf-program-bg { transform: scale(1.06); }
.sf-program-overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.92) 100%); transition: opacity 0.4s ease; }
.sf-program-card:hover .sf-program-overlay { opacity: 0.9; }
.sf-program-content { position: relative; z-index: 1; padding: 40px 40px 40px 37px; width: 100%; border-left: 3px solid #c0392b; }
.sf-program-tag { display: inline-block; font-family: 'Poppins', sans-serif; font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.55); margin-bottom: 12px; }
.sf-program-content h3 { font-family: 'Poppins', sans-serif; font-size: 1.75rem; font-weight: 700; color: #fff; margin: 0 0 16px; line-height: 1.1; }
.sf-program-content p { font-family: 'Poppins', sans-serif; font-size: 0.9375rem; line-height: 1.75; color: rgba(255,255,255,0.65); margin: 0 0 24px; max-width: 480px; }
.sf-program-link { display: inline-flex; align-items: center; gap: 6px; font-family: 'Poppins', sans-serif; font-size: 0.875rem; font-weight: 600; color: #fff; text-decoration: none; border-bottom: 1px solid rgba(255,255,255,0.3); padding-bottom: 2px; transition: color 0.3s ease, border-color 0.3s ease; }
.sf-program-link:hover { color: #c0392b; border-color: #c0392b; }
.sf-program-link span { transition: transform 0.3s ease; }
.sf-program-link:hover span { transform: translateX(4px); }
.sf-cta { background: #0e0e0e; padding: 0 24px 100px; position: relative; }
.sf-cta::before { content: ''; display: block; height: 1px; background: rgba(255,255,255,0.08); margin-bottom: 100px; }
.sf-cta-inner { max-width: 900px; margin: 0 auto; text-align: center; }
.sf-cta-eyebrow { display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: #c0392b; font-family: 'Poppins', sans-serif; margin-bottom: 24px; }
.sf-cta h2 { font-family: 'Poppins', sans-serif; font-size: clamp(2rem, 4.5vw, 3.25rem); font-weight: 700; line-height: 1.15; color: #fff; margin: 0 0 20px; letter-spacing: -0.01em; }
.sf-cta-sub { font-family: 'Poppins', sans-serif; font-size: 1.0625rem; line-height: 1.8; color: rgba(255,255,255,0.45); margin: 0 auto 48px; max-width: 580px; }
.sf-cta-btn { display: inline-flex; align-items: center; gap: 10px; font-family: 'Poppins', sans-serif; font-size: 0.9375rem; font-weight: 700; letter-spacing: 0.04em; text-decoration: none; color: #fff; background: #c0392b; padding: 18px 44px; transition: background 0.3s ease, transform 0.25s ease; }
.sf-cta-btn:hover { background: #a93226; transform: translateY(-2px); }
.sf-cta-btn span { display: inline-block; transition: transform 0.3s ease; }
.sf-cta-btn:hover span { transform: translateX(4px); }
.sf-prog-link { background: none !important; box-shadow: none !important; }

/* ── Responsive ── */
@media (max-width: 960px) {
    #sf-hdr-inner { padding: 0 28px; }
    #sf-hdr-nav, #sf-hdr-search-btn, #sf-hdr-lang, #sf-hdr-donate { display: none; }
    #sf-hdr-burger { display: flex; }
    #sf-hdr-tagline { display: none; }
}
@media (max-width: 480px) {
    #sf-hdr-inner { padding: 0 20px; }
}
@media (max-width: 900px) {
    .sf-wwd-intro { grid-template-columns: 1fr; gap: 24px; padding-bottom: 48px; margin-bottom: 48px; }
    .sf-wwd-grid { grid-template-columns: 1fr; gap: 2px; }
    .sf-wwd-img { height: 220px; }
    .sf-ep-grid { grid-template-columns: 1fr; }
    .sf-ep { padding: 64px 20px; }
    .sf-ep-header { text-align: left; margin-bottom: 40px; }
    .sf-ep-card { min-height: 280px; }
    .sf-programs-grid { grid-template-columns: 1fr; }
    .sf-programs { padding: 64px 20px; }
    .sf-program-card { min-height: 380px; }
    .sf-program-content { padding: 28px 24px; }
}
@media (max-width: 600px) {
    .sf-wwd { padding: 64px 20px; }
    .sf-cta { padding: 0 20px 72px; }
    .sf-cta::before { margin-bottom: 64px; }
    .sf-cta-btn { padding: 16px 32px; font-size: 0.875rem; }
}
</style>
<?php }, 999);

// ── 3. Header HTML ─────────────────────────────────────────────────
add_action('wp_footer', function() {
    $logo = 'https://new.sudanfacts.org/wp-content/uploads/2026/04/logo-scaled-e1779046400231.png';
    $home = home_url('/');
    $current_lang = function_exists('pll_current_language') ? pll_current_language() : 'en';
    $en_url = function_exists('pll_home_url') ? pll_home_url('en') : $home;
    $ar_url = function_exists('pll_home_url') ? pll_home_url('ar') : '#';
    $active = function($condition) { return $condition ? ' class="sf-active"' : ''; };
?>
<header id="sf-header" role="banner">
    <div id="sf-hdr-inner">

        <!-- Logo + Africa SVG -->
        <div id="sf-hdr-logo-group">
            <a href="<?php echo esc_url($home); ?>" id="sf-hdr-logo">
                <img src="<?php echo esc_url($logo); ?>" alt="Facts Center for Journalism" height="34">
            </a>
            <div id="sf-hdr-logo-sep"></div>
            <img id="sf-africa-svg" src="https://new.sudanfacts.org/wp-content/uploads/2026/06/africa_header.svg" width="32" height="38" alt="" aria-hidden="true" style="display:block;flex-shrink:0;">
        </div>

        <!-- Centered tagline -->
        <div id="sf-hdr-tagline">Facts Center for Journalism Services</div>

        <nav id="sf-hdr-nav" role="navigation" aria-label="Main navigation">
            <a href="<?php echo esc_url($home); ?>"<?php echo $active(is_front_page()); ?>>Home</a>

            <!-- About mega dropdown -->
            <div class="sf-hdr-dd" id="sf-about-dd">
                <button class="sf-hdr-dd-btn" aria-expanded="false" aria-haspopup="true">
                    About
                    <svg class="sf-hdr-dd-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
                <div class="sf-mega-panel" role="menu">
                    <div class="sf-mega-inner sf-mega-about">
                        <div class="sf-mega-col">
                            <a href="<?php echo esc_url(home_url('/about/')); ?>" role="menuitem">
                                <div>
                                    <strong>Who We Are</strong>
                                    <span class="sf-mega-desc">Our mission and history</span>
                                </div>
                                <span class="sf-mega-arrow">→</span>
                            </a>
                        </div>
                        <div class="sf-mega-col">
                            <a href="<?php echo esc_url(home_url('/about/')); ?>#principles" role="menuitem">
                                <div>
                                    <strong>Editorial Principles</strong>
                                    <span class="sf-mega-desc">Standards and independence</span>
                                </div>
                                <span class="sf-mega-arrow">→</span>
                            </a>
                        </div>
                        <div class="sf-mega-col">
                            <a href="<?php echo esc_url(home_url('/about/')); ?>#team" role="menuitem">
                                <div>
                                    <strong>Our Team</strong>
                                    <span class="sf-mega-desc">The people behind the work</span>
                                </div>
                                <span class="sf-mega-arrow">→</span>
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Programs mega dropdown -->
            <div class="sf-hdr-dd" id="sf-programs-dd">
                <button class="sf-hdr-dd-btn" aria-expanded="false" aria-haspopup="true">
                    Programs
                    <svg class="sf-hdr-dd-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
                <div class="sf-mega-panel" role="menu">
                    <div class="sf-mega-inner sf-mega-programs">
                        <div class="sf-mega-col">
                            <a href="<?php echo esc_url(home_url('/programs/atar-network/')); ?>" role="menuitem">
                                <div>
                                    <strong>Atar Network</strong>
                                    <span class="sf-mega-desc">Investigative reporting from Sudan</span>
                                </div>
                                <span class="sf-mega-arrow">→</span>
                            </a>
                        </div>
                        <div class="sf-mega-col">
                            <a href="<?php echo esc_url(home_url('/programs/zamala/')); ?>" role="menuitem">
                                <div>
                                    <strong>Zamala</strong>
                                    <span class="sf-mega-desc">Journalism fellowship program</span>
                                </div>
                                <span class="sf-mega-arrow">→</span>
                            </a>
                        </div>
                        <div class="sf-mega-col sf-mega-spacer"></div>
                        <div class="sf-mega-col sf-mega-all">
                            <a href="<?php echo esc_url(home_url('/programs/')); ?>" role="menuitem">
                                <div>
                                    <strong>All Programs →</strong>
                                    <span class="sf-mega-desc">Browse all our initiatives</span>
                                </div>
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Events mega dropdown -->
            <div class="sf-hdr-dd" id="sf-events-dd">
                <button class="sf-hdr-dd-btn" aria-expanded="false" aria-haspopup="true">
                    Events
                    <svg class="sf-hdr-dd-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
                <div class="sf-mega-panel" role="menu">
                    <div class="sf-mega-inner sf-mega-events">
                        <div class="sf-mega-col">
                            <a href="<?php echo esc_url(home_url('/events/')); ?>#forum" role="menuitem">
                                <div>
                                    <strong>Atar Forum</strong>
                                    <span class="sf-mega-desc">Annual journalism conference</span>
                                </div>
                                <span class="sf-mega-arrow">→</span>
                            </a>
                        </div>
                        <div class="sf-mega-col">
                            <a href="<?php echo esc_url(home_url('/events/')); ?>#workshops" role="menuitem">
                                <div>
                                    <strong>Workshops</strong>
                                    <span class="sf-mega-desc">Skills and training sessions</span>
                                </div>
                                <span class="sf-mega-arrow">→</span>
                            </a>
                        </div>
                        <div class="sf-mega-col sf-mega-all">
                            <a href="<?php echo esc_url(home_url('/events/')); ?>" role="menuitem">
                                <div>
                                    <strong>All Events →</strong>
                                    <span class="sf-mega-desc">Full calendar of events</span>
                                </div>
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            <a href="<?php echo esc_url(home_url('/contact/')); ?>"<?php echo $active(is_page('contact')); ?>>Contact</a>
        </nav>

        <div id="sf-hdr-actions">
            <button id="sf-hdr-search-btn" aria-label="Search">
                <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </button>
            <div id="sf-hdr-lang">
                <?php if ($current_lang === 'en'): ?>
                    <span class="sf-lang-current">EN</span>
                    <span id="sf-hdr-lang-sep">|</span>
                    <a href="<?php echo esc_url($ar_url); ?>" hreflang="ar">AR</a>
                <?php else: ?>
                    <a href="<?php echo esc_url($en_url); ?>" hreflang="en">EN</a>
                    <span id="sf-hdr-lang-sep">|</span>
                    <span class="sf-lang-current">AR</span>
                <?php endif; ?>
            </div>
            <a href="#" id="sf-hdr-donate">Donate</a>
            <button id="sf-hdr-burger" aria-label="Open menu" aria-expanded="false">
                <span></span><span></span><span></span>
            </button>
        </div>
    </div>
</header>

<!-- Full-screen Mobile Drawer -->
<div id="sf-hdr-drawer" role="dialog" aria-label="Navigation" aria-hidden="true">
    <div id="sf-drawer-top">
        <a href="<?php echo esc_url($home); ?>" id="sf-drawer-logo">
            <img src="<?php echo esc_url($logo); ?>" alt="Facts Center for Journalism" height="28">
        </a>
        <button id="sf-drawer-close" aria-label="Close menu">
            CLOSE <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
    </div>

    <nav class="sf-drawer-nav">
        <a href="<?php echo esc_url($home); ?>"<?php echo $active(is_front_page()); ?>>
            Home
            <svg class="sf-drawer-arrow" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </a>
        <a href="<?php echo esc_url(home_url('/about/')); ?>"<?php echo $active(is_page('about')); ?>>
            About
            <svg class="sf-drawer-arrow" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </a>
        <button class="sf-drawer-acc" aria-expanded="false">
            Programs
            <svg class="sf-drawer-arrow" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
        <div class="sf-drawer-sub">
            <a href="<?php echo esc_url(home_url('/programs/atar-network/')); ?>">
                <div>
                    <strong>Atar Network</strong>
                    <span>Investigative reporting from Sudan</span>
                </div>
                <svg class="sf-drawer-sub-arrow" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </a>
            <a href="<?php echo esc_url(home_url('/programs/zamala/')); ?>">
                <div>
                    <strong>Zamala</strong>
                    <span>Journalism fellowship program</span>
                </div>
                <svg class="sf-drawer-sub-arrow" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </a>
        </div>
        <a href="<?php echo esc_url(home_url('/events/')); ?>"<?php echo $active(is_page('events')); ?>>
            Events
            <svg class="sf-drawer-arrow" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </a>
        <a href="<?php echo esc_url(home_url('/contact/')); ?>"<?php echo $active(is_page('contact')); ?>>
            Contact
            <svg class="sf-drawer-arrow" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </a>
    </nav>

    <div id="sf-drawer-bottom">
        <div class="sf-drawer-actions">
            <div class="sf-drawer-lang">
                <?php if ($current_lang === 'en'): ?>
                    <span class="sf-lang-current">EN</span>
                    <span class="sf-drawer-lang-sep">|</span>
                    <a href="<?php echo esc_url($ar_url); ?>" hreflang="ar">AR</a>
                <?php else: ?>
                    <a href="<?php echo esc_url($en_url); ?>" hreflang="en">EN</a>
                    <span class="sf-drawer-lang-sep">|</span>
                    <span class="sf-lang-current">AR</span>
                <?php endif; ?>
            </div>
            <a href="#" class="sf-drawer-donate">Donate</a>
        </div>
        <span class="sf-drawer-tagline">Facts Center for Journalism Services · sudanfacts.org</span>
    </div>
</div>

<!-- Search Overlay -->
<div id="sf-hdr-search" role="dialog" aria-label="Search" aria-hidden="true">
    <button id="sf-search-close" aria-label="Close search">
        ESC <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
    <form id="sf-search-form" role="search" action="<?php echo esc_url($home); ?>" method="get">
        <label for="sf-search-input">Search Sudan Facts</label>
        <input type="search" id="sf-search-input" name="s" placeholder="Type and press Enter…" autocomplete="off" spellcheck="false">
    </form>
</div>
<?php
}, 1);

// ── 4. Header JS ───────────────────────────────────────────────────
add_action('wp_footer', function() { ?>
<script id="sf-header-js">
(function(){
    var hdr = document.getElementById('sf-header');
    var burger = document.getElementById('sf-hdr-burger');
    var drawer = document.getElementById('sf-hdr-drawer');
    var drawerClose = document.getElementById('sf-drawer-close');
    var searchBtn = document.getElementById('sf-hdr-search-btn');
    var searchOverlay = document.getElementById('sf-hdr-search');
    var searchClose = document.getElementById('sf-search-close');
    var searchInput = document.getElementById('sf-search-input');
    var drawerAcc = document.querySelector('.sf-drawer-acc');
    var drawerSub = document.querySelector('.sf-drawer-sub');

    if (window.location.pathname === '/') {
        document.body.style.setProperty('padding-top', '0', 'important');
        window.addEventListener('load', function() {
            document.body.style.setProperty('padding-top', '0', 'important');
        });
    }

    if (!hdr) return;

    // Scroll state
    function onScroll() {
        hdr.classList.toggle('sf-scrolled', window.scrollY > 60);
    }
    window.addEventListener('scroll', onScroll, {passive: true});
    onScroll();

    // ── Mega dropdowns — generalized hover + click (desktop) ──
    var ddWrappers = document.querySelectorAll('.sf-hdr-dd');
    ddWrappers.forEach(function(dd) {
        var btn = dd.querySelector('.sf-hdr-dd-btn');
        var megaPanel = dd.querySelector('.sf-mega-panel');
        var ddTimer;

        function openDD() {
            clearTimeout(ddTimer);
            ddWrappers.forEach(function(other) {
                if (other !== dd) {
                    other.classList.remove('open');
                    var otherBtn = other.querySelector('.sf-hdr-dd-btn');
                    if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
                }
            });
            dd.classList.add('open');
            if (btn) btn.setAttribute('aria-expanded', 'true');
        }
        function closeDD() {
            ddTimer = setTimeout(function() {
                dd.classList.remove('open');
                if (btn) btn.setAttribute('aria-expanded', 'false');
            }, 120);
        }

        dd.addEventListener('mouseenter', openDD);
        dd.addEventListener('mouseleave', closeDD);

        // Keep open when hovering over fixed mega panel
        if (megaPanel) {
            megaPanel.addEventListener('mouseenter', function() { clearTimeout(ddTimer); });
            megaPanel.addEventListener('mouseleave', closeDD);
        }

        // Click toggle (mobile fallback / keyboard nav)
        if (btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var isOpen = dd.classList.contains('open');
                if (isOpen) {
                    dd.classList.remove('open');
                    btn.setAttribute('aria-expanded', 'false');
                } else {
                    openDD();
                    clearTimeout(ddTimer);
                }
            });
        }
    });

    // Mobile drawer
    function openDrawer() {
        drawer.classList.add('open');
        burger.classList.add('open');
        burger.setAttribute('aria-expanded', 'true');
        drawer.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }
    function closeDrawer() {
        drawer.classList.remove('open');
        burger.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
        drawer.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }
    if (burger) burger.addEventListener('click', function() {
        burger.classList.contains('open') ? closeDrawer() : openDrawer();
    });
    if (drawerClose) drawerClose.addEventListener('click', closeDrawer);

    // Drawer accordion
    if (drawerAcc && drawerSub) {
        drawerAcc.addEventListener('click', function() {
            var open = drawerSub.classList.toggle('open');
            drawerAcc.classList.toggle('open', open);
            drawerAcc.setAttribute('aria-expanded', String(open));
        });
    }

    // Search
    function openSearch() {
        searchOverlay.classList.add('open');
        searchOverlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        setTimeout(function() { if(searchInput) searchInput.focus(); }, 80);
    }
    function closeSearch() {
        searchOverlay.classList.remove('open');
        searchOverlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }
    if (searchBtn) searchBtn.addEventListener('click', openSearch);
    if (searchClose) searchClose.addEventListener('click', closeSearch);

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') { closeSearch(); closeDrawer(); }
    });
    document.addEventListener('click', function(e) {
        ddWrappers.forEach(function(dd) {
            if (!dd.contains(e.target)) {
                var panel = dd.querySelector('.sf-mega-panel');
                if (panel && panel.contains(e.target)) return;
                dd.classList.remove('open');
                var btn = dd.querySelector('.sf-hdr-dd-btn');
                if (btn) btn.setAttribute('aria-expanded', 'false');
            }
        });
    });
})();
</script>
<?php });
