> [!WARNING] 
> Part of this code was AI-generated (booo). I originally only made this plugin for myself, but if there's user demand I will do a manual rewrite.

# gifCategories

A Vencord UserPlugin that brings custom category management to Discord's GIF picker. Organise your favourite GIFs into colour-coded groups for easier filtering.

## Installation

1. Install [Vencord from source](https://docs.vencord.dev/installing/).
2. Follow the [Installing custom plugins](https://docs.vencord.dev/installing/custom-plugins/) guide. When "adding your plugin", place these files in a folder within the `/userplugins/` folder.

## Features
### Category management
- Create named categories with optional colour swatches (8 preset colours)
- Add/remove GIFs to categories via a toggle dropdown — works in both the GIF picker and on GIFs embedded in messages
- Right-click the `+` button for a context menu alternative
- Delete categories (with confirmation) — GIFs in deleted categories are cleaned up automatically

### Per-account, local storage
- All categories and GIF-to-category mappings are stored locally per Discord account via Vencord's DataStore
- No server sync

### Export & Import data
- Export your categories and mappings as a JSON file (plugin settings)
- Import them back on another device or after a reinstall

## Compatiblity

Works with the official vencord plugins [betterGifPicker](https://github.com/Vendicated/Vencord/tree/main/src/plugins/betterGifPicker) and [favouriteGifSearch](https://github.com/Vendicated/Vencord/tree/main/src/plugins/favGifSearch). Not aware of any compatibility issues as of now.

## Support
no... figure it out yourself