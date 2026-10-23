# OMEGA UI photo assets and attribution

These assets are real-world reference photographs sourced from Wikimedia Commons. The generated `.webp` files are resized/re-encoded derivatives; original files remain at the linked Commons pages. Image rights remain with their respective authors/licensors.

## Redistribution and modifications

- The in-game photo captions link the source file page and licence, name the author, and disclose the resize/WebP conversion.
- Images are resized to fit within 1280 pixels and converted to WebP. Camera/EXIF metadata is not carried into the derived files.
- Creative Commons Attribution images retain a source-page link, a licence link, creator credit, and a modification notice.
- Adapted CC BY-SA images must remain under the same or a compatible share-alike licence. Their derivative image files are distributed under the original CC BY-SA 4.0 terms; this does not relicense the game's source code.
- Public-domain and CC0 images retain source credit as a courtesy, even when attribution is not required.
- Photographs are illustration/context only. Do not imply a selected country owns, operates, or is geographically associated with a pictured facility unless the game has separate evidence for that fact.

## Source list

| Local asset ID | Original title and creator | License | Source |
|---|---|---|---|
| `bangladesh-parliament` | The Parliament building of the People's Republic of Bangladesh.jpg · AuthorTasin | CC BY-SA 4.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:The_Parliament_building_of_the_People%27s_Republic_of_Bangladesh.jpg) |
| `un-assembly-building` | UN General Assembly Building.jpg · Nadia Chaudhury | CC BY 2.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:UN_General_Assembly_Building.jpg) |
| `bangladesh-police-headquarters` | Police Headquarter Dhaka.jpg · Wasiul Bahar | CC BY-SA 4.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Police_Headquarter_Dhaka.jpg) |
| `chittagong-hospital` | Chittagong International Medical College & Hospital building.jpg · RiazACU | CC BY-SA 4.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Chittagong_International_Medical_College_%26_Hospital_building.jpg) |
| `uss-nimitz` | USS Nimitz (CVN-68).jpg · United States Navy | Public domain (U.S. federal government work) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:USS_Nimitz_(CVN-68).jpg) |
| `open-pit-mine` | Open pit mine.jpg · Irene2005 | CC BY 2.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Open_pit_mine.jpg) |
| `geelong-oil-refinery` | Geelong Oil Refinery 2026.jpg · Totallynotarandomalt69 | CC BY 4.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Geelong_Oil_Refinery_2026.jpg) |
| `industrial-production-line` | Industrial production line operating in a large modern factory.jpg · Shixart1985 | CC BY 2.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Industrial_production_line_operating_in_a_large_modern_factory.jpg) |
| `wind-farm` | Wind farm turbines.jpg · Greg Goebel | Public domain | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Wind_farm_turbines.jpg) |
| `hydroelectric-plant` | Winooski One Hydroelectric Plant Dam.jpg · Ohead | CC0 1.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Winooski_One_Hydroelectric_Plant_Dam.jpg) |
| `container-ship` | ContainerShip.jpg · Syukrimsw | CC BY-SA 4.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:ContainerShip.jpg) |
| `wheat-field` | Field of Wheat.jpg · Kmtextor | CC BY 4.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Field_of_Wheat.jpg) |
| `mosque-architecture` | Architecture of mosque.jpg · Amini Aisyah | CC BY 4.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Architecture_of_mosque.jpg) |
| `dhaka-skyline` | Sky View of Dhaka City.jpg · S.M.M.Musabbir Uddin | CC BY 4.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Sky_View_of_Dhaka_City.jpg) |

## Updating the photo library

Use `python scripts/download_omega_ui_photo_assets.py --download` in an internet-enabled environment with Pillow installed. The script checks each file's current Commons API licence metadata against the explicit allowed licence aliases before downloading, and fails closed if the licence cannot be confirmed. Then run `node --test test/omega_ui_photo_assets.test.mjs`.

Do not reuse an ID for another photograph unless the source, author, licence, and captions have been reviewed again.

## Import verification record

On 23 October 2026, the branch importer confirmed the current Wikimedia Commons licence metadata for all 14 approved sources, generated 14 local WebP images totalling 2,775,906 bytes, and passed the dedicated photo-catalog and attribution checks after the CC0 API alias was corrected. The pull-request verification job also passed its Commons metadata re-check and UI visual regression suite.
