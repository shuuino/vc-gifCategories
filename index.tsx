/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/* DISCLAIMER: Part of this code was ai-generated*/

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Button } from "@components/Button";
import { DataStore } from "@api/index";
import { findGroupChildrenByChildId } from "@api/ContextMenu";
import definePlugin, { OptionType } from "@utils/types";
import { React, useState, useEffect, useRef, useCallback, createRoot, Menu, ContextMenuApi, UserStore } from "@webpack/common";

import type { Root } from "react-dom/client";
import managedStyle from "./style.css?managed";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Category {
    name: string;
    color?: string;
}

const PRESET_COLORS = [
    "#5865F2", // Discord blurple
    "#57F287", // green
    "#FEE75C", // yellow
    "#EB459E", // pink
    "#ED4245", // red
    "#FF73FA", // magenta
    "#00B0F4", // cyan
    "#FFFFFF", // white
];

const CUSTOM = "___custom___";

interface Gif {
    format: number;
    src: string;
    width: number;
    height: number;
    order: number;
    url: string;
}

interface Instance {
    state: { resultType?: string; };
    props: {
        favorites: Gif[];
        favCopy: Gif[];
    };
    forceUpdate: () => void;
}



// ─── Helpers ──────────────────────────────────────────────────────────────────
// GIFs can have different URL representations of the same image (e.g. CDN query
// params in messages vs clean URLs in the picker). Normalize to avoid desync.

function getGifId(url: string): string {
    try {
        const u = new URL(url);
        if (/tenor\.(com|co)$/i.test(u.hostname)) {
            const m = u.pathname.match(/\/([A-Za-z0-9_-]{5,})\//);
            if (m) return m[1];
            const n = u.pathname.match(/\/([A-Za-z0-9_-]{5,})\.gif$/);
            if (n) return n[1];
        }
        if (/giphy\.com$/i.test(u.hostname)) {
            let m = u.pathname.match(/\/media\/([A-Za-z0-9_-]{5,})\//);
            if (m) return m[1];
            m = u.pathname.match(/\/([A-Za-z0-9_-]{5,})\.gif$/);
            if (m) return m[1];
        }
        if (/gifconvert\.vxtwitter\.com/i.test(u.hostname)) {
            const videoUrl = u.searchParams.get("url");
            if (videoUrl) {
                try {
                    const v = new URL(videoUrl);
                    const m = v.pathname.match(/\/([A-Za-z0-9_-]+)\.\w+$/);
                    if (m) return m[1];
                    return videoUrl;
                } catch { /* fall through */ }
            }
        }
        u.search = "";
        u.hash = "";
        return u.href;
    } catch {
        return url;
    }
}



// ─── DataStore ────────────────────────────────────────────────────────────────

function getUserId(): string {
    return UserStore.getCurrentUser()?.id ?? "default";
}

function keyCats() { return `gifCategories_v3_cats_${getUserId()}`; }
function keyGifMap() { return `gifCategories_v3_map_${getUserId()}`; }

const _catChangeListeners = new Set<() => void>();
function notifyCatsChanged() { _catChangeListeners.forEach(fn => fn()); }
function onCatsChanged(fn: () => void) {
    _catChangeListeners.add(fn);
    return () => { _catChangeListeners.delete(fn); };
}

async function getCats(): Promise<Category[]> {
    return (await DataStore.get<Category[]>(keyCats())) ?? [];
}
async function getGifMap(): Promise<Record<string, string[]>> {
    return (await DataStore.get<Record<string, string[]>>(keyGifMap())) ?? {};
}
async function saveCats(cats: Category[]) {
    await DataStore.set(keyCats(), [...cats].sort((a, b) => a.name.localeCompare(b.name)));
}
async function saveGifMap(map: Record<string, string[]>) {
    await DataStore.set(keyGifMap(), map);
}
async function addGifToCategory(gifUrl: string, category: string) {
    const map = await getGifMap();
    const existing = map[gifUrl] ?? [];
    if (!existing.includes(category)) {
        map[gifUrl] = [...existing, category];
        await saveGifMap(map);
    }
}
async function removeGifFromCategory(gifUrl: string, category: string) {
    const map = await getGifMap();
    if (!map[gifUrl]) return;
    map[gifUrl] = map[gifUrl].filter(c => c !== category);
    if (map[gifUrl].length === 0) delete map[gifUrl];
    await saveGifMap(map);
}
async function createCategory(name: string, color?: string) {
    const cats = await getCats();
    if (!cats.some(c => c.name === name)) {
        await saveCats([...cats, { name, ...(color ? { color } : {}) }]);
        notifyCatsChanged();
    }
}
async function deleteCategory(name: string) {
    const cats = await getCats();
    const map = await getGifMap();
    for (const url of Object.keys(map)) {
        map[url] = map[url].filter(c => c !== name);
        if (map[url].length === 0) delete map[url];
    }
    await saveGifMap(map);
    await saveCats(cats.filter(c => c.name !== name));
    notifyCatsChanged();
}
async function renameCategory(oldName: string, newName: string) {
    const cats = await getCats();
    const idx = cats.findIndex(c => c.name === oldName);
    if (idx === -1) return;
    if (cats.some(c => c.name === newName && c.name !== oldName)) return;
    cats[idx].name = newName;
    const map = await getGifMap();
    for (const url of Object.keys(map)) {
        if (map[url].includes(oldName)) {
            map[url] = map[url].map(c => c === oldName ? newName : c);
        }
    }
    await saveGifMap(map);
    await saveCats(cats);
    notifyCatsChanged();
}
async function updateCategoryColor(name: string, color?: string) {
    const cats = await getCats();
    const idx = cats.findIndex(c => c.name === name);
    if (idx === -1) return;
    if (color) cats[idx].color = color;
    else delete cats[idx].color;
    await saveCats(cats);
    notifyCatsChanged();
}
async function getCatColor(name: string): Promise<string | undefined> {
    const cats = await getCats();
    return cats.find(c => c.name === name)?.color;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

// ─── Context menu category cache ────────────────────────────────────────
// Categories are fetched once and cached for use in synchronous context menu rendering.

let _ctxCats: Category[] = [];
getCats().then(c => { _ctxCats = c; });

function isGifUrl(src: string): boolean {
    return /\.(gif|webp|mp4)($|[?#])/i.test(src)
        || /\banimated=true\b/.test(src)
        || /\bformat=gif\b/i.test(src)
        || /tenor\.(com|co)/i.test(src)
        || /giphy\.com/i.test(src)
        || /gifconvert\.vxtwitter\.com/i.test(src);
}

const settings = definePluginSettings({
    defaultCategory: {
        type: OptionType.STRING,
        description: "Category selected by default when opening favourites (leave empty for All)",
        default: "",
    },
    showCatListOnHoverPicker: {
        type: OptionType.BOOLEAN,
        description: "Show the category list by default when hovering a GIF in the picker (off: click the + button to open the list)",
        default: false,
    },
    showCatListOnHoverMsg: {
        type: OptionType.BOOLEAN,
        description: "Show the category list by default when hovering a GIF in a message (on: list appears on hover; off: click the + button to open the list)",
        default: true,
    },
    twoBarCategories: {
        type: OptionType.BOOLEAN,
        description: "Show colored and non-colored categories in two separate bars (colored on top, non-colored below)",
        default: false,
    },
    sortColoredFirst: {
        type: OptionType.BOOLEAN,
        description: "Sort colored categories before non-colored in the category bar (when two-bar mode is disabled)",
        default: false,
    },
    hideEditBtn: {
        type: OptionType.BOOLEAN,
        description: "Hide the edit button (✎) in the category dropdown",
        default: false,
    },
    hideDeleteBtn: {
        type: OptionType.BOOLEAN,
        description: "Hide the delete button (×) in the category dropdown",
        default: false,
    },
    clearData: {
        type: OptionType.BOOLEAN,
        description: "Toggle to clear ALL categories and GIF-category data (cannot be undone)",
        default: false,
        onChange: async (val: boolean) => {
            if (!val) return;
            await DataStore.set(keyCats(), []);
            await DataStore.set(keyGifMap(), {});
            notifyCatsChanged();
            settings.store.clearData = false;
        },
    },
    exportData: {
        type: OptionType.COMPONENT,
        component: () => (
            <Button onClick={async () => {
                const cats = await getCats();
                const map = await getGifMap();
                const blob = new Blob([JSON.stringify({ cats, map }, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `gif-categories-${getUserId()}.json`;
                a.click();
                URL.revokeObjectURL(url);
            }}>
                Export Data
            </Button>
        ),
    },
    importData: {
        type: OptionType.COMPONENT,
        component: () => {
            const inputRef = useRef<HTMLInputElement>(null);
            return (
                <>
                    <input ref={inputRef} type="file" accept=".json" style={{ display: "none" }}
                        onChange={async e => {
                            const file = e.currentTarget.files?.[0];
                            if (!file) return;
                            try {
                                const text = await file.text();
                                const data = JSON.parse(text);
                                if (data.cats && data.map) {
                                    await DataStore.set(keyCats(), data.cats);
                                    await DataStore.set(keyGifMap(), data.map);
                                    notifyCatsChanged();
                                    alert("Data imported successfully!");
                                } else {
                                    alert("Invalid file format: expected { cats, map }");
                                }
                            } catch (err) {
                                alert("Failed to import: " + String(err));
                            }
                            e.currentTarget.value = "";
                        }} />
                    <Button onClick={() => inputRef.current?.click()}>
                        Import Data
                    </Button>
                </>
            );
        },
    },
});

// ─── Category Dropdown ────────────────────────────────────────────────────────
// Appears on hover over the "+" button (in GIF picker and message overlay).
// Shows all categories as toggle buttons.

function CategoryDropdown({ gifUrl }: { gifUrl: string }) {
    const [cats, setCats] = useState<Category[]>([]);
    const [gifCats, setGifCats] = useState<string[]>([]);
    const [editing, setEditing] = useState<Category | null>(null);
    // Scroll-hide via body class is handled in the wheel handler below.
    // Position tracking per-component was removed because it could lose
    // the element ref on re-render, causing the dropdown to never re-appear.
    /*
    const [hidden, setHidden] = useState(false);
    const ddRef = useRef<HTMLDivElement>(null);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const el = ddRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        let lastPos = `${rect.top},${rect.left}`;
        const handler = () => {
            if (!ddRef.current) return;
            const r = ddRef.current.getBoundingClientRect();
            const pos = `${r.top},${r.left}`;
            if (pos !== lastPos) {
                lastPos = pos;
                setHidden(true);
                if (hideTimer.current) clearTimeout(hideTimer.current);
                hideTimer.current = setTimeout(() => {
                    setHidden(false);
                    hideTimer.current = null;
                }, 400);
            }
        };
        document.addEventListener("scroll", handler, { passive: true, capture: true });
        window.addEventListener("resize", handler, { passive: true });
        return () => {
            document.removeEventListener("scroll", handler, { capture: true });
            window.removeEventListener("resize", handler);
            if (hideTimer.current) clearTimeout(hideTimer.current);
        };
    }, []);
    */

    const reload = useCallback(async () => {
        setCats(await getCats());
        const map = await getGifMap();
        setGifCats(map[gifUrl] ?? []);
    }, [gifUrl]);

    useEffect(() => { reload(); }, [reload]);

    async function toggle(cat: string) {
        const map = await getGifMap();
        const current = map[gifUrl] ?? [];
        if (current.includes(cat)) {
            await removeGifFromCategory(gifUrl, cat);
        } else {
            await addGifToCategory(gifUrl, cat);
        }
        await reload();
    }

    async function delCat(cat: string) {
        if (!confirm(`Delete category "${cat}"? This will remove it from all GIFs.`)) return;
        await deleteCategory(cat);
        await reload();
    }

    if (cats.length === 0) return null;

    if (editing) {
        return (
            <div className="vc-gifcat-cat-dropdown">
                <CategoryFormPopup initialName={editing.name} initialColor={editing.color}
                    onClose={() => { setEditing(null); reload(); }} />
            </div>
        );
    }

    return (
        <div className="vc-gifcat-cat-dropdown">
            {cats.map(cat => (
                <div key={cat.name} className="vc-gifcat-cat-row">
                    <button className={`vc-gifcat-cat-btn${gifCats.includes(cat.name) ? " active" : ""}`}
                        onClick={e => { e.stopPropagation(); toggle(cat.name); }}>
                        {cat.color && <span className="vc-gifcat-cat-dot" style={{ background: cat.color }} />}
                        {cat.name}
                    </button>
                    {!settings.store.hideEditBtn && (
                        <button className="vc-gifcat-cat-edit-btn" title="Edit category"
                            onClick={e => { e.stopPropagation(); setEditing(cat); }}>✎</button>
                    )}
                    {!settings.store.hideDeleteBtn && (
                        <button className="vc-gifcat-cat-del-btn" title="Delete category"
                            onClick={e => { e.stopPropagation(); delCat(cat.name); }}>×</button>
                    )}
                </div>
            ))}
        </div>
    );
}

// ─── Category Form Popup ─────────────────────────────────────────────────────
// Supports both creating a new category and editing an existing one.
// Includes preset color swatches and a custom color picker (type="color" + hex input).

function CategoryFormPopup({ gifUrl, initialName, initialColor, onClose }: { gifUrl?: string; initialName?: string; initialColor?: string; onClose: () => void }) {
    const isEdit = !!initialName;
    const [name, setName] = useState(initialName ?? "");
    const [color, setColor] = useState<string | undefined>(initialColor);
    const [customHex, setCustomHex] = useState(initialColor ?? "#5865F2");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { inputRef.current?.focus(); }, []);
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        const handler = (e: KeyboardEvent) => { if (e.key === " ") e.stopPropagation(); };
        el.addEventListener("keydown", handler, true);
        el.addEventListener("keypress", handler, true);
        el.addEventListener("keyup", handler, true);
        return () => {
            el.removeEventListener("keydown", handler, true);
            el.removeEventListener("keypress", handler, true);
            el.removeEventListener("keyup", handler, true);
        };
    }, []);

    async function submit() {
        const trimmed = name.trim();
        if (!trimmed) return;
        if (isEdit) {
            if (trimmed !== initialName) await renameCategory(initialName!, trimmed);
            if (color !== initialColor) await updateCategoryColor(trimmed, color);
        } else {
            await createCategory(trimmed, color);
            if (gifUrl) await addGifToCategory(gifUrl, trimmed);
        }
        onClose();
    }

    const showCustom = color === CUSTOM;
    const resolvedColor = showCustom ? customHex : color;

    return (
        <div className="vc-gifcat-new-popup" onClick={e => e.stopPropagation()}>
            <div className="vc-gifcat-new-header">{isEdit ? "Edit Category" : "New Category"}</div>
            <input ref={inputRef} className="vc-gifcat-new-input"
                placeholder="Category name" value={name} maxLength={32}
                onChange={e => setName(e.currentTarget.value)}
                onKeyDown={e => { if (e.key === " ") e.preventDefault(); e.stopPropagation(); if (e.key === "Enter") submit(); if (e.key === "Escape") onClose(); }}
                onKeyUp={e => { if (e.key === " ") e.stopPropagation(); }} />
            <div className="vc-gifcat-color-row">
                <button key={CUSTOM}
                    className={`vc-gifcat-color-swatch vc-gifcat-color-custom${showCustom ? " active" : ""}`}
                    title="Custom color"
                    onClick={() => setColor(showCustom ? undefined : CUSTOM)} />
                {PRESET_COLORS.map(c => (
                    <button key={c}
                        className={`vc-gifcat-color-swatch${!showCustom && color === c ? " active" : ""}`}
                        style={{ background: c }}
                        onClick={() => setColor(color === c ? undefined : c)} />
                ))}
                <button className="vc-gifcat-color-none" title="No color"
                    onClick={() => setColor(undefined)}>✕</button>
            </div>
            {showCustom && (
                <div className="vc-gifcat-custom-color-row">
                    <input type="color" className="vc-gifcat-color-wheel" value={customHex}
                        onChange={e => { setCustomHex(e.currentTarget.value); setColor(CUSTOM); }} />
                    <input className="vc-gifcat-hex-input" placeholder="#hex" value={customHex} maxLength={7}
                        onChange={e => { const v = e.currentTarget.value; setCustomHex(v); if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor(CUSTOM); }} />
                </div>
            )}
            <div className="vc-gifcat-new-actions">
                <button className="vc-gifcat-new-cancel" onClick={onClose}>Cancel</button>
                <button className="vc-gifcat-new-confirm" onClick={submit}>{isEdit ? "Save" : "Create"}</button>
            </div>
        </div>
    );
}

// ─── GIF item "+" button (redesigned) ─────────────────────────────────────────
// Styled like Discord's favorite star button. Clicking creates new categories.
// Hovering reveals the CategoryDropdown.

interface CatButtonProps {
    item?: Gif;
    gifUrl?: string;
    showOnHover?: boolean;
}

function CatButton({ item, gifUrl: _gifUrl, showOnHover = true }: CatButtonProps) {
    const [showNew, setShowNew] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);
    const gifUrl = _gifUrl || (item ? getGifId(item.url ?? item.src) : "");
    if (!gifUrl) return null;

    // Picker context: listen on [data-focused] parent for dropdown show/hide.
    // Message context: when showOnHover, always show dropdown (overlay IS the hover).
    useEffect(() => {
        const el = wrapRef.current?.closest?.("[data-focused]") as HTMLElement | null;
        if (!el) {
            // Message overlay context
            if (showOnHover) setShowDropdown(true);
            return;
        }
        if (showOnHover) {
            const enter = () => setShowDropdown(true);
            const leave = () => setShowDropdown(false);
            el.addEventListener("mouseenter", enter);
            el.addEventListener("mouseleave", leave);
            return () => {
                el.removeEventListener("mouseenter", enter);
                el.removeEventListener("mouseleave", leave);
            };
        } else {
            const leave = () => { setShowDropdown(false); setShowNew(false); };
            el.addEventListener("mouseleave", leave);
            return () => el.removeEventListener("mouseleave", leave);
        }
    }, [showOnHover]);

    function handleCtx(e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        ContextMenuApi.openContextMenu(e, () => (
            <Menu.Menu navId="vc-gifcat-gif-menu" onClose={ContextMenuApi.closeContextMenu} aria-label="GIF Categories">
                {_ctxCats.length === 0 ? (
                    <Menu.MenuItem id="vc-gifcat-no-cats" label="No categories" disabled />
                ) : (
                    _ctxCats.map(cat => (
                        <Menu.MenuCheckboxItem
                            key={`ctx-${cat.name}`}
                            id={`vc-gifcat-cat-${cat.name}`}
                            label={cat.name}
                            checked={false}
                            action={() => addGifToCategory(gifUrl, cat.name)} />
                    ))
                )}
                <Menu.MenuSeparator />
                <Menu.MenuItem id="vc-gifcat-new-ctx" label="New category"
                    action={async () => {
                        const name = prompt("Category name:");
                        if (name?.trim()) {
                            await createCategory(name.trim());
                            await addGifToCategory(gifUrl, name.trim());
                        }
                    }} />
            </Menu.Menu>
        ));
    }

    function handleClick(e: React.MouseEvent) {
        e.stopPropagation();
        if (showOnHover) {
            setShowNew(true);
        } else if (showDropdown) {
            setShowDropdown(false);
            setShowNew(true);
        } else {
            setShowDropdown(true);
        }
    }

    return (
        <div className="vc-gifcat-btn-wrap" ref={wrapRef} onContextMenu={handleCtx}>
            <button className="vc-gifcat-star-btn"
                title="+"
                onClick={handleClick}>+</button>
            {showDropdown && <CategoryDropdown gifUrl={gifUrl} />}
            {showNew && (
                <CategoryFormPopup gifUrl={gifUrl}
                    onClose={() => setShowNew(false)} />
            )}
        </div>
    );
}

// ─── Message GIF overlay button (redesigned) ──────────────────────────────────
// Rendered via createRoot portal when hovering over a GIF in a message.

function MsgGifOverlay({ gifUrl, onLeave, onCancel }: { gifUrl: string; onLeave: () => void; onCancel: () => void; }) {
    return (
        <div className="vc-gifcat-msg-overlay"
            onMouseEnter={onCancel}
            onMouseLeave={onLeave}>
            <CatButton gifUrl={gifUrl} showOnHover={settings.store.showCatListOnHoverMsg} />
        </div>
    );
}

// ─── Category Bar ─────────────────────────────────────────────────────────────
// Horizontal scrollable pill bar at the top of the Favourites view.

interface CategoryBarProps {
    active: string | null;
    onSelect(cat: string | null): void;
}

function CategoryBar({ active, onSelect }: CategoryBarProps) {
    const [cats, setCats] = useState<Category[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const scrollRef2 = useRef<HTMLDivElement>(null);
    const [showL, setShowL] = useState(false);
    const [showR, setShowR] = useState(false);
    const [showL2, setShowL2] = useState(false);
    const [showR2, setShowR2] = useState(false);
    const dragRef = useRef<{ startX: number; scrollLeft: number; down: boolean; }>({ startX: 0, scrollLeft: 0, down: false });
    const { twoBarCategories, sortColoredFirst } = settings.store;

    function sortCats(list: Category[]) {
        if (!twoBarCategories && sortColoredFirst) {
            const colored = list.filter(c => c.color);
            const plain = list.filter(c => !c.color);
            return [...colored, ...plain];
        }
        return list;
    }

    useEffect(() => {
        getCats().then(c => setCats(sortCats(c)));
        return onCatsChanged(() => getCats().then(c => setCats(sortCats(c))));
    }, [twoBarCategories, sortColoredFirst]);

    function updateArrows() {
        const el = scrollRef.current;
        if (el) { setShowL(el.scrollLeft > 4); setShowR(el.scrollLeft + el.clientWidth < el.scrollWidth - 4); }
        const el2 = scrollRef2.current;
        if (el2) { setShowL2(el2.scrollLeft > 4); setShowR2(el2.scrollLeft + el2.clientWidth < el2.scrollWidth - 4); }
    }

    useEffect(() => {
        updateArrows();
        const el = scrollRef.current;
        const el2 = scrollRef2.current;
        if (el) el.addEventListener("scroll", updateArrows, { passive: true });
        if (el2) el2.addEventListener("scroll", updateArrows, { passive: true });
        return () => {
            if (el) el.removeEventListener("scroll", updateArrows);
            if (el2) el2.removeEventListener("scroll", updateArrows);
        };
    }, [cats]);

    function scrollBy(ref: React.RefObject<HTMLDivElement | null>, amount: number) {
        ref.current?.scrollBy({ left: amount, behavior: "smooth" });
    }

    function onMouseDown(e: React.MouseEvent) {
        const el = e.currentTarget as HTMLDivElement;
        dragRef.current.down = true;
        dragRef.current.startX = e.pageX - el.offsetLeft;
        dragRef.current.scrollLeft = el.scrollLeft;
    }

    function onMouseMove(e: React.MouseEvent) {
        if (!dragRef.current.down) return;
        e.preventDefault();
        const el = e.currentTarget as HTMLDivElement;
        const x = e.pageX - el.offsetLeft;
        const walk = (x - dragRef.current.startX) * 1.5;
        el.scrollLeft = dragRef.current.scrollLeft - walk;
    }

    function onMouseUp() {
        dragRef.current.down = false;
    }

    const colored = cats.filter(c => c.color);
    const plain = cats.filter(c => !c.color);

    function renderBar(catList: Category[], ref: React.RefObject<HTMLDivElement | null>, showL: boolean, showR: boolean) {
        return (
            <div className={`vc-gifcat-bar-wrap${showL ? " fl" : ""}${showR ? " fr" : ""}`}>
                {showL && (
                    <button className="vc-gifcat-bar-arrow"
                        onClick={() => scrollBy(ref, -160)}>‹</button>
                )}
                <div className="vc-gifcat-bar-scroll">
                    <div className="vc-gifcat-bar" ref={ref}
                        onMouseDown={onMouseDown}
                        onMouseMove={onMouseMove}
                        onMouseUp={onMouseUp}
                        onMouseLeave={onMouseUp}>
                        <button className={`vc-gifcat-pill${active === null ? " active" : ""}`}
                            onClick={() => onSelect(null)}>All</button>
                        {catList.map(cat => (
                            <button key={cat.name}
                                className={`vc-gifcat-pill${active === cat.name ? " active" : ""}`}
                                style={cat.color ? { borderColor: cat.color, backgroundColor: cat.color + "22" } : {}}
                                onClick={() => onSelect(cat.name)}>
                                {cat.name}
                            </button>
                        ))}
                    </div>
                </div>
                {showR && (
                    <button className="vc-gifcat-bar-arrow"
                        onClick={() => scrollBy(ref, 160)}>›</button>
                )}
            </div>
        );
    }

    if (cats.length === 0) return null;

    if (twoBarCategories && plain.length > 0 && colored.length > 0) {
        return (
            <>
                {renderBar(colored, scrollRef, showL, showR)}
                {renderBar(plain, scrollRef2, showL2, showR2)}
            </>
        );
    }

    return renderBar(cats, scrollRef, showL, showR);
}

// ─── Favourites content wrapper ───────────────────────────────────────────────
// Renders the category bar above the gif grid, and filters favorites by category.

interface FavContentProps {
    instance: Instance;
    getContent: () => React.ReactNode;
}

function FavContent({ instance, getContent }: FavContentProps) {
    const isFav = instance?.state?.resultType === "Favorites";
    const originalFavCopy = useRef<Gif[] | null>(null);

    const [active, setActive] = useState<string | null>(
        isFav ? (settings.store.defaultCategory || null) : null
    );

    const applyFilter = useCallback(async (cat: string | null) => {
        setActive(cat);
        const { props } = instance;
        if (!originalFavCopy.current) {
            originalFavCopy.current = [...(props.favCopy ?? props.favorites)];
        }
        if (cat === null) {
            props.favorites = [...originalFavCopy.current];
            props.favCopy = [...originalFavCopy.current];
        } else {
            const map = await getGifMap();
            const filtered = originalFavCopy.current.filter(gif => {
                const url = getGifId(gif.url ?? gif.src);
                return (map[url] ?? []).includes(cat);
            });
            props.favCopy = [...filtered];
            props.favorites = filtered;
        }
        instance.forceUpdate();
    }, [instance]);

    return (
        <>
            {isFav && (
                <ErrorBoundary noop>
                    <CategoryBar active={active} onSelect={applyFilter} />
                </ErrorBoundary>
            )}
            <React.Fragment key={active ?? "__all"}>
                {getContent()}
            </React.Fragment>
        </>
    );
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "GifCategories",
    description: "Organise favourite GIFs into custom categories with a filter bar",
    authors: [{ id: 0n, name: "you" }],
    settings,
    managedStyle,

    patches: [
        // ── Patch 1: inject "+" button into each GIF item ──────────────────
        //
        // Module 285961 exports uG (the GIF item class) and Ay (the grid).
        // The render() method of uG returns a container with children:
        //   [ renderGIF(), renderExtras(item) ]
        //
        // We verified the exact source:
        //   render(){
        //     let{item:e,renderExtras:t,...}=this.props;
        //     ...
        //     return(0,i.jsxs)(_.D,{
        //       "data-focused":s,
        //       children:[x(n)?null:this.renderGIF(), null!=t?t(e):null]
        //     })
        //   }
        //
        // find: '"data-focused"' — unique to this component, confirmed from
        //   live runtime source via Vencord.Webpack.findAll.
        //
        // match: the end of the children array: null!=\i?\i(\i):null]
        // replace: prepend our CatButton before that last child.
        //   We use this.props.item to get the gif object reliably.
        {
            find: "handleCanPlay",
            replacement: {
                match: /(null!=\i\?\i\(\i\):null\])/,
                replace: "$self.renderCatButton(this.props.item),$1",
            },
        },

        // ── Patch 3: overlay "+" button on GIFs inside messages ───────────
        //
        // Targets LazyImage component (".handleImageLoad)") — the same
        // component used for all images in messages. We inject props that
        // mark GIF images with data-vc-gif and add mouse enter/leave
        // handlers that show/hide a portal overlay with our "+" button.
        //
        // Based on ImageZoom's makeProps pattern.
        {
            find: ".handleImageLoad)",
            replacement: {
                match: /(placeholderVersion:\i,(?=.{0,50}children:))/,
                replace: "...$self.msgGifProps(this),$1"
            },
        },

        // ── Patch 2: inject category bar above the gif grid ────────────────
        //
        // Module 622142, class $ (the main GIF picker).
        // render() produces:
        //   <div role="tabpanel">
        //     <div className={K.wx}>  {renderHeader()}  </div>
        //     <div className={K.Qs}>  {renderContent()}  </div>  ← patched here
        //   </div>
        //
        // We wrap renderContent() with our FavContent component which:
        //   - renders the category pill bar when resultType === "Favorites"
        //   - filters this.props.favorites by the active category
        //   - calls the original renderContent() for the actual gif grid
        //
        // find: "renderHeaderContent()" — same anchor used by BetterGifPicker
        //   and FavoriteGifSearch, confirmed to be in module 622142.
        //
        // match: verified against actual module source. The className is a
        //   two-part CSS module reference (\i.\i) unique to this content div.
        {
            find: "renderHeaderContent()",
            replacement: {
                match: /(className:\i\.\i,children:)(this\.renderContent\(\))/,
                replace: "$1$self.wrapContent(this,()=>$2)",
            },
        },
    ],

    // Called by Patch 1. Renders the "+" button overlay for a single GIF item.
    renderCatButton(item: Gif) {
        if (!item) return null;
        return (
            <ErrorBoundary noop>
                <CatButton item={item} showOnHover={settings.store.showCatListOnHoverPicker} />
            </ErrorBoundary>
        );
    },

    // Called by Patch 2. Wraps renderContent() with the category bar.
    wrapContent(instance: Instance, getContent: () => React.ReactNode) {
        return (
            <ErrorBoundary noop fallback={() => getContent()}>
                <FavContent instance={instance} getContent={getContent} />
            </ErrorBoundary>
        );
    },

    // ── Message GIF overlay (delegated native listeners) ─────────────────────

    _msgElement: null as HTMLDivElement | null,
    _msgRoot: null as Root | null,
    _msgCloseTimer: null as ReturnType<typeof setTimeout> | null,
    _currentGifEl: null as HTMLElement | null,
    _msgOverHandler: null as ((e: MouseEvent) => void) | null,
    _msgOutHandler: null as ((e: MouseEvent) => void) | null,
    _msgPosUpdater: null as (() => void) | null,
    _msgTrackedEl: null as HTMLElement | null,
    _msgMoveTimer: null as ReturnType<typeof setTimeout> | null,

    isMsgGif(src: string, contentType?: string): boolean {
        if (contentType === "image/gif") return true;
        if (contentType === "image/webp" && (
            /tenor\.(com|co)/i.test(src)
            || /giphy\.com/i.test(src)
            || /gifconvert\.vxtwitter\.com/i.test(src)
            || /\.gif($|[?#])/i.test(src)
            || /\banimated=true\b/.test(src)
            || /\bformat=gif\b/i.test(src)
        )) return true;
        if (/\.(gif|webp|mp4)($|[?#])/i.test(src)) return true;
        if (/\banimated=true\b/.test(src)) return true;
        if (/\bformat=gif\b/i.test(src)) return true;
        if (/tenor\.(com|co)/i.test(src)) return true;
        if (/giphy\.com/i.test(src)) return true;
        if (/gifconvert\.vxtwitter\.com/i.test(src)) return true;
        return false;
    },

    // Called by Patch 3. Injects data-vc-gif attribute into LazyImage's DOM element.
    // Uses props.original (the canonical source URL, e.g. Tenor view page) when
    // available, falling back to props.src (Discord CDN proxy). This ensures the
    // DataStore key matches the picker context.
    msgGifProps(instance: any) {
        const props = instance?.props ?? {};
        if (typeof props.src !== "string") return {};
        if (!this.isMsgGif(props.src, props.contentType)) return {};
        const gifSource = props.original ?? props.src;
        return { "data-vc-gif": getGifId(gifSource) };
    },

    // Global delegated handlers — fire on ANY mouseover/mouseout in the document.
    // We capture events on [data-vc-gif] elements to show/hide the overlay.
    // Only act on elements inside message or embed containers (skip modals, previews, etc.).
    _onDelegatedOver(e: MouseEvent) {
        const el = (e.target as Element)?.closest?.("[data-vc-gif]") as HTMLElement | null;
        if (!el) return;
        if (!el.closest('[class*="message"]') && !el.closest('[class*="embed"]')) return;
        const wrapper = el.closest('[class*="imageWrapper"]');
        if (wrapper && !wrapper.querySelector('[class*="gifFavoriteButton"]')) return;
        if (el === this._currentGifEl) {
            if (this._msgCloseTimer) { clearTimeout(this._msgCloseTimer); this._msgCloseTimer = null; }
            return;
        }
        if (this._msgCloseTimer) { clearTimeout(this._msgCloseTimer); this._msgCloseTimer = null; }
        this._currentGifEl = el;
        const src = el.getAttribute("data-vc-gif") || "";
        if (!src) return;
        this._showOverlay(el, src);
    },

    _onDelegatedOut(e: MouseEvent) {
        if (!this._currentGifEl) return;
        const target = e.target as Node;
        const related = e.relatedTarget as Node | null;
        if (!this._currentGifEl.contains(target)) return;
        if (related && this._currentGifEl.contains(related)) return;
        if (related && this._msgElement?.contains(related)) {
            if (this._msgCloseTimer) { clearTimeout(this._msgCloseTimer); this._msgCloseTimer = null; }
            return;
        }
        this._msgScheduleHide();
    },

    _updateOverlayPos(el: HTMLElement) {
        if (!this._msgElement) return;
        const rect = el.getBoundingClientRect();
        this._msgElement.style.position = "fixed";
        this._msgElement.style.zIndex = "10000";
        this._msgElement.style.pointerEvents = "none";
        this._msgElement.style.top = `${rect.top}px`;
        this._msgElement.style.left = `${rect.left}px`;
        this._msgElement.style.width = `${rect.width}px`;
        this._msgElement.style.height = `${rect.height}px`;
    },

    _startPosTracking(el: HTMLElement) {
        this._stopPosTracking();
        this._msgTrackedEl = el;
        this._msgPosUpdater = () => { if (this._msgTrackedEl) this._updateOverlayPos(this._msgTrackedEl); };
        document.addEventListener("scroll", this._msgPosUpdater, { passive: true, capture: true });
        window.addEventListener("resize", this._msgPosUpdater, { passive: true });
    },

    _stopPosTracking() {
        this._msgTrackedEl = null;
        if (this._msgPosUpdater) {
            document.removeEventListener("scroll", this._msgPosUpdater, { capture: true });
            window.removeEventListener("resize", this._msgPosUpdater);
            this._msgPosUpdater = null;
        }
    },

    // This tracked-element-style scroll hide was unreliable:
    // per-element opacity changes conflicted with body-class CSS,
    // and refs could go stale on re-render. Replaced by wheel-based
    // body-class approach in _setupGifGridScroll below.
    /*
    _startPosTracking(el: HTMLElement) {
        this._stopPosTracking();
        this._msgTrackedEl = el;
        const rect = el.getBoundingClientRect();
        let lastPos = `${rect.top},${rect.left},${rect.width},${rect.height}`;
        this._msgPosUpdater = () => {
            if (!this._msgTrackedEl) return;
            const r = this._msgTrackedEl.getBoundingClientRect();
            const pos = `${r.top},${r.left},${r.width},${r.height}`;
            if (pos !== lastPos) {
                lastPos = pos;
                this._updateOverlayPos(this._msgTrackedEl);
                if (this._msgElement) { this._msgElement.style.opacity = "0"; this._msgElement.style.pointerEvents = "none"; }
                if (this._msgMoveTimer) clearTimeout(this._msgMoveTimer);
                this._msgMoveTimer = setTimeout(() => {
                    if (this._msgElement) { this._msgElement.style.opacity = ""; this._msgElement.style.pointerEvents = ""; }
                    this._msgMoveTimer = null;
                }, 400);
            }
        };
        document.addEventListener("scroll", this._msgPosUpdater, { passive: true, capture: true });
        window.addEventListener("resize", this._msgPosUpdater, { passive: true });
    },

    _stopPosTracking() {
        this._msgTrackedEl = null;
        if (this._msgMoveTimer) { clearTimeout(this._msgMoveTimer); this._msgMoveTimer = null; }
        if (this._msgPosUpdater) {
            document.removeEventListener("scroll", this._msgPosUpdater, { capture: true });
            window.removeEventListener("resize", this._msgPosUpdater);
            this._msgPosUpdater = null;
        }
    },
    */

    _showOverlay(el: HTMLElement, src: string) {
        if (!this._msgElement) return;
        this._updateOverlayPos(el);
        this._startPosTracking(el);
        if (this._msgRoot) this._msgRoot.unmount();
        this._msgRoot = createRoot(this._msgElement);
        this._msgRoot.render(
            <ErrorBoundary noop>
                <MsgGifOverlay gifUrl={src}
                    onLeave={() => this._msgScheduleHide()}
                    onCancel={() => { if (this._msgCloseTimer) { clearTimeout(this._msgCloseTimer); this._msgCloseTimer = null; } }} />
            </ErrorBoundary>
        );
    },

    _msgScheduleHide() {
        if (this._msgCloseTimer) clearTimeout(this._msgCloseTimer);
        this._msgCloseTimer = setTimeout(() => this._msgHide(), 200);
    },

    _msgHide() {
        if (this._msgCloseTimer) { clearTimeout(this._msgCloseTimer); this._msgCloseTimer = null; }
        this._currentGifEl = null;
        this._stopPosTracking();
        this._msgRoot?.unmount();
        this._msgRoot = null;
    },

    // ── Context menus ──────────────────────────────────────────────────────

    contextMenus: {
        "image-context"(children: any[], props: any) {
            if (!props?.src || !isGifUrl(props.src)) return;
            const group = findGroupChildrenByChildId("copy-native-link", children) ?? children;
            group.push(
                <Menu.MenuItem id="vc-gifcat-add-to-cat" label="Add to category">
                    {_ctxCats.length === 0 ? (
                        <Menu.MenuItem id="vc-gifcat-no-cats" label="No categories" disabled />
                    ) : (
                        _ctxCats.map(cat => (
                            <Menu.MenuCheckboxItem
                                key={`imgctx-${cat.name}`}
                                id={`vc-gifcat-img-${cat.name}`}
                                label={cat.name}
                                checked={false}
                                action={() => addGifToCategory(getGifId(props.src), cat.name)} />
                        ))
                    )}
                    <Menu.MenuSeparator />
                    <Menu.MenuItem id="vc-gifcat-new-imgctx" label="New category"
                        action={async () => {
                            const name = prompt("Category name:");
                            if (name?.trim()) {
                                await createCategory(name.trim());
                                await addGifToCategory(getGifId(props.src), name.trim());
                            }
                        }} />
                </Menu.MenuItem>
            );
        },
    },

    _unsubCatsChanged: null as (() => void) | null,
    _gifGridScrollTimer: null as ReturnType<typeof setTimeout> | null,
    _gifGridScrollCleanup: null as (() => void) | null,
    _lastTrackedPos: null as string | null,

    _setupGifGridScroll() {
        const SCROLLING_CLASS = "vc-gifcat-scrolling";
        const handler = () => {
            if (this._msgTrackedEl) {
                const rect = this._msgTrackedEl.getBoundingClientRect();
                const pos = `${rect.top},${rect.left}`;
                if (pos === this._lastTrackedPos) return;
                this._lastTrackedPos = pos;
            }
            document.body.classList.add(SCROLLING_CLASS);
            if (this._gifGridScrollTimer) clearTimeout(this._gifGridScrollTimer);
            this._gifGridScrollTimer = setTimeout(() => {
                document.body.classList.remove(SCROLLING_CLASS);
                this._gifGridScrollTimer = null;
            }, 400);
        };
        document.addEventListener("wheel", handler, { capture: true, passive: true });
        this._gifGridScrollCleanup = () => document.removeEventListener("wheel", handler, { capture: true });
    },

    start() {
        this._msgElement = document.createElement("div");
        this._msgElement.id = "vc-gifcat-msg-root";
        document.body.appendChild(this._msgElement);
        this._msgOverHandler = (e: MouseEvent) => this._onDelegatedOver(e);
        this._msgOutHandler = (e: MouseEvent) => this._onDelegatedOut(e);
        document.addEventListener("mouseover", this._msgOverHandler, true);
        document.addEventListener("mouseout", this._msgOutHandler, true);
        this._unsubCatsChanged = onCatsChanged(() => getCats().then(c => { _ctxCats = c; }));
        this._setupGifGridScroll();
    },

    stop() {
        if (this._msgOverHandler) document.removeEventListener("mouseover", this._msgOverHandler, true);
        if (this._msgOutHandler) document.removeEventListener("mouseout", this._msgOutHandler, true);
        this._msgOverHandler = null;
        this._msgOutHandler = null;
        this._unsubCatsChanged?.();
        this._unsubCatsChanged = null;
        this._msgHide();
        this._msgElement?.remove();
        this._msgElement = null;
        if (this._gifGridScrollCleanup) { this._gifGridScrollCleanup(); this._gifGridScrollCleanup = null; }
        if (this._gifGridScrollTimer) { clearTimeout(this._gifGridScrollTimer); this._gifGridScrollTimer = null; }
    },
});
