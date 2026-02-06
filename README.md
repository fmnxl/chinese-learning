# 漢字 Chinese Radicals Learning App

A modern web application for learning Chinese characters through their radicals, components, and structural relationships. Built with SvelteKit and powered by comprehensive open-source datasets.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

## ✨ Features

### 📚 Multiple Learning Paths

- **By Radical** — Browse all 214 Kangxi radicals and explore characters grouped by their semantic root
- **By Level** — Progress through HSK-aligned difficulty levels, from beginner (Grade 1) to advanced (Grade 6)
- **By Component** — Discover phonetic series and common building blocks that appear across many characters

### 🔍 Character Detail Pages

Each character page includes:
- **Pinyin & definitions** from Unihan/CC-CEDICT
- **Stroke count & frequency rank** from SUBTLEX-CH corpus
- **IDS decomposition tree** — visual breakdown of character structure (e.g., 想 = ⿱相心)
- **Example words** — common vocabulary containing the character, sorted by frequency
- **Derived characters** — characters that contain this one as a component
- **Simplified ↔ Traditional** cross-references

### 🤖 AI Chat Assistant

- "Ask AI" button on character pages to explore etymology, mnemonics, and usage
- Streaming responses via OpenRouter API (BYOK — bring your own key)
- Context-aware prompts with quick-start templates

### 📝 Study List with SRS

- Add characters/words to your personal study list
- SM-2 spaced repetition algorithm ready
- Data persisted in IndexedDB with localStorage fallback
- Import/export study lists as JSON

## 🏗️ Architecture

```
chinese/
├── parse_unihan.py         # ETL pipeline: Unihan + CEDICT + CHISE + SUBTLEX → radicals.json
├── data/
│   └── radicals.json       # Generated unified dataset (~23MB)
├── sveltekit-app/          # Frontend SvelteKit application
│   ├── src/
│   │   ├── routes/         # Page routes
│   │   │   ├── +page.svelte         # Home: radical grid
│   │   │   ├── learn/               # By level view
│   │   │   ├── phonetic/            # By component view
│   │   │   ├── char/[char]/         # Character detail
│   │   │   ├── word/[word]/         # Word detail
│   │   │   └── radical/[id]/        # Radical detail
│   │   ├── lib/
│   │   │   ├── data/loader.ts       # Singleton data loader
│   │   │   ├── stores/              # Svelte stores (chat, studyList)
│   │   │   ├── components/          # Reusable components
│   │   │   └── utils/ids.ts         # IDS parsing utilities
│   │   └── app.css          # Global styles
│   └── static/
│       └── data/radicals.json       # Symlinked dataset
└── flake.nix               # Nix development environment
```

## 📊 Data Sources

The ETL pipeline (`parse_unihan.py`) merges multiple authoritative datasets:

| Source | Data Provided |
|--------|---------------|
| **Unihan** (Unicode) | Pinyin, definitions, radical classification, simplified/traditional variants |
| **CC-CEDICT** | 120k+ word definitions, phrase examples |
| **CHISE IDS** | Ideographic Description Sequences for character decomposition |
| **SUBTLEX-CH** | Character & word frequency from 33M-word film subtitle corpus |

### Generated Dataset

The output `radicals.json` contains:
- **214 radicals** with pinyin, meaning, and associated characters
- **20,000+ characters** with full metadata
- **Words** referenced by characters with frequency data

## 🚀 Getting Started

### Prerequisites

- Node.js 20+ (or use the Nix flake)
- Python 3.9+ with `openpyxl` (for ETL only)

### Development

```bash
# Using Nix (recommended)
nix develop

# Navigate to the app
cd sveltekit-app

# Install dependencies
npm install

# Start dev server
npm run dev -- --port 8080
```

Visit `http://localhost:8080` to explore.

### Backend API

```bash
# Backend dev shell
nix develop .#backend

# Start backend (SQLite locally)
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8100
```

See `backend/README.md` for API documentation.

### Rebuilding the Dataset

If you need to regenerate `radicals.json` from source data:

```bash
# Download source files first:
# - unihan.zip from https://www.unicode.org/Public/UCD/latest/ucd/
# - cedict.txt from https://cc-cedict.org/
# - chise-ids-master from https://gitlab.chise.org/CHISE/ids
# - SUBTLEX-CH-WF.xlsx and SUBTLEX-CH-CHR.xlsx from https://www.ugent.be/pp/experimentele-psychologie/en/research/documents/subtlexch

# Run ETL
python parse_unihan.py

# Copy to static folder
cp data/radicals.json sveltekit-app/static/data/
```

## 🔧 Configuration

### OpenRouter API Key

For the AI chat feature, get an API key from [openrouter.ai/keys](https://openrouter.ai/keys):

1. Click the ⚙️ settings icon in the header
2. Enter your API key (starts with `sk-or-...`)
3. Keys are stored locally in your browser

## 📱 Screenshots

The app features a dark-themed, modern UI with:
- Responsive grid layouts for all screen sizes
- Grade-level badges (G1-G6) with color coding
- Frequency rank indicators
- Interactive IDS decomposition trees
- Resizable AI chat panel

## 🛣️ Roadmap

- [ ] Spaced repetition review sessions
- [ ] Handwriting input with stroke order animation
- [ ] Audio pronunciation
- [ ] User accounts with cloud sync
- [ ] HSK vocabulary lists integration

## 📄 License

MIT License — feel free to use, modify, and distribute.

## 🙏 Acknowledgments

- [Unicode Consortium](https://unicode.org/) for Unihan database
- [CC-CEDICT](https://cc-cedict.org/) for Chinese-English dictionary
- [CHISE Project](https://www.chise.org/) for IDS decomposition data
- [SUBTLEX-CH](https://www.ugent.be/pp/experimentele-psychologie/en/research/documents/subtlexch) for frequency data
