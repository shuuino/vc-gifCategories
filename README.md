> [!WARNING] 
> Part of this code was AI-generated (booo). I originally only made this plugin for myself, but if there's user demand I will do a manual rewrite.

# gifCategories

A Vencord UserPlugin that brings custom category management to Discord's GIF picker. Organise your favourite GIFs into colour-coded groups for easier filtering.
<br>
<img width="472" height="325" alt="image" src="https://github.com/user-attachments/assets/53e48fb7-10c5-4f48-afd9-a9f1aac2f682" />
<br>
<img width="430" height="310" alt="image" src="https://github.com/user-attachments/assets/152d8bdf-2e55-4fcd-aec5-7b5e7733bf82" />
<br>
<img width="511" height="505" alt="image" src="https://github.com/user-attachments/assets/8e79a6f9-2acc-4f42-b8a0-b4603952a12b" />

## Installation
An installation guide can be found [here](https://discord.com/channels/1015060230222131221/1257038407503446176/1257038407503446176).

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
