# Fonts

**e-Ukraine** and **e-Ukraine Head** — the Ukrainian state brand typeface family,
published as part of the Ukraine / Дія brandbook (design: Banda Agency for the
Ministry of Digital Transformation of Ukraine). Free to use, including
commercially, under the terms published with the brandbook:
<https://brandbook.brand.gov.ua/>

Files here are **subsets** of the official OTF releases — Latin, Latin Extended-A,
Cyrillic, Ukrainian ґ/Ґ, typographic punctuation, ₴, № and arrows — converted to
WOFF2 (same files as the semantyka.com.ua landing).

Six faces ship: Regular (400), Medium (500) and Bold (700) of each family.
`fonts.css` maps `500 600` onto Medium on purpose — neither family has a real 600
weight, and without that range every `font-semibold` would silently render Bold.

**FiraGO** — the Georgian typeface (`fonts/ka.css`, used under `lang="ka"`): Carrois
Corporate and bBox Type, Georgian by Akaki Razmadze. Licensed under the SIL Open Font
License 1.1, see `FiraGO/OFL.txt`. Chosen because Georgia's e-government sites use it
(rs.ge, napr.gov.ge).

Files are **subsets** of bBoxType/FiraGO 1.001 (`Fonts/FiraGO_WEB_1001/Roman`) — Georgian
(Mkhedruli, Nuskhuri), Latin, Latin-1, Latin Extended-A, typographic punctuation, ₾, € and
№; no Cyrillic, so Ukrainian text in a Georgian UI falls through to e-Ukraine. The release has
no Mtavruli (capital Georgian), which is why `ka.css` turns `text-transform` off.

Four faces ship: Regular (400), Medium (500), SemiBold (600) and Bold (700); each is a real
weight, so no weight mapping is needed.
