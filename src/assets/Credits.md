# 使用的外部素材

## 字体

- Google Fonts

## 音乐

### [DOVA-SYNDROME](https://dova-s.jp/)

- MATSU - 戦いの旅路を征く #`battle/001`
- まんぼう二等兵 - 情動カタルシス #`battle/002`
- 田中芳典 - 風立ちぬ-Le vent se lève- #`scene/001`
- しゃろう - 追憶 #`scene/002`
- 蒲鉾さちこ - Lazy night(気だるい夜) #`scene/003`
- もっぴーさうんど - 夢見る憧憬 #`scene/004`
- かずち - TALK and WALK #`scene/005`

### [Unisphere](https://unisphere.tv/)

#### [\[UNSP-0003\]地球ヤバイEP](https://unisphere.tv/unsp0003/)

- Soleily - Renatus #`battle/003`

#### [\[UNSP-0005, UNSP-0006\]宇宙ヤバイEP](https://unisphere.tv/unsp0005/)

- Soleily - The Ruins of Stardust #`battle/004`

#### [\[UNSP-0010\]ふとんEP](https://unisphere.tv/unsp0010/)

- TCT - Sink under the dream world #`scene/006`
- CELLON. - 三日月シエスタ #`scene/007`
- polycube - みやこわすれ #`scene/008`

#### [\[UNSP-0014\]GrayScape](https://unisphere.tv/unsp0014/)

- HOUJIROU - X.Y.Z #`scene/009`
- おみー　- Memories Sacrifice #`battle/005`
- MONO - Past Future #`battle/006`
- Frums - the end of this world, and the girl who crossed the moon's oceans. #`scene/010`

#### [\[UNSP-0015\]GRIMGROOVE](https://unisphere.tv/unsp0015/)

- Frums - Zephyrs #`scene/011`

#### [\[UNSP-0016\]あるくEP](https://unisphere.tv/unsp0016/)

- K.key - Midway #`scene/012`
- Kaname Shigeyoshi - chasing a day #`scene/013`
- maki - Before the Sunrise #`battle/007`
- Prily - Synthesizer #`scene/014`

#### [\[UNSP-A00X\]ぼくらの音楽](https://5th.unisphere.tv/)

##### \[UNSP-A001\]ぼくらの音楽 Unit01

- Silentroom - ぼくらの音楽 Jingle theme #`scene/015`
- taqumi - Chromatic Neon City #`scene/016`

##### \[UNSP-A002\]ぼくらの音楽 Unit02

- Blogath - Voyager #`scene/017`
- HAKT - snow bright #`battle/008`
- うまるつふり - 季峡～ときのかい～ #`scene/018`
- ああああ + daph - C'est la Vie #`scene/019`
- しゃぐま - 穢れ無き水面 #`scene/020`

##### \[UNSP-A003\]ぼくらの音楽 Unit03

- HOUJIROU - Balalaika #`scene/021`
- Oversleep - Rhododendron indicum #`scene/022`

##### \[UNSP-A004\]ぼくらの音楽 Unit04

- Se-U-Ra - I3374 #`battle/009`
- Arch - I'm standing here #`battle/010`

##### \[UNSP-A005\]ぼくらの音楽 Unit05

- TwilighT  - Scatter flower #`scene/023`
- PaRang - Follow Your Own Way #`battle/011`

## Battle presentation textures

Selected unchanged alpha PNGs from **Kenney Vleugels, Particle Pack 1.1**:
[official source](https://kenney.nl/assets/particle-pack),
[download](https://kenney.nl/media/pages/assets/particle-pack/f8fe0f8cb8-1677578741/kenney_particle-pack.zip).
License: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); the package license is retained in `battle-effects/License.txt`.

- `slash_02.png`: Physical curved cutting trace
- `trace_01.png`: Gun / flying-projectile penetrating streak
- `flame_05.png`: Fire tongue
- `spark_05.png`: Electric branching strike
- `twirl_02.png`: Wind bands
- `dirt_01.png`: Earth fragments
- `star_04.png`: Light rays
- `symbol_01.png`: Heal heart
- Shared accents: `light_01.png` (glow), `magic_01.png` (seal / neutral protection), `circle_03.png` (rim), `flame_01.png` (Fire wisps)

These twelve PNGs are unchanged `PNG (Transparent)/` entries, 512 × 512.
Filter-template contributors credited by the package: Indigo Ray, Craig Nisbet,
Zoltan Erdokovy, Heliagon, ThreeDee, Killst4r and Tim2501.

Four original project-authored, self-contained 512 × 512 SVG alpha masks (not
Kenney artwork): `icewater.svg` (drop, ice facets and ripple), `dark.svg` (eclipse
with hooked shadow edge), `almighty.svg` (multi-axis energy crystal), and
`ailment.svg` (broken offset curse). Gradients and cutouts are encoded in alpha;
there are no external fonts, images or animated filters.

Runtime alpha masks tint, scale and rotate all sixteen images. Nominal decoded
base RGBA is 16 MiB (16 × 512 × 512 × 4), not total GPU/browser memory. The complete
file-size and browser-decode inventory is recorded in V2 implementation evidence.
