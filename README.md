# Vaani

Read the books Osho loved, out loud, and improve your English as you go.

- **Library**: 101 free public-domain books. 50 are from Osho's *Books I Have Loved*; the rest are more books by the same authors.
- **Reader**: tap any word for its meaning, pronunciation and example. Select a sentence to have its grammar explained. Get a summary and a simple explanation of any page.
- **Read aloud**: read a page and every word turns green (clear) or red (sounded like a different word). Tap a red word to hear and practise it.
- **Retell**: explain the page in your own words and get grammar fixes and better word choices.
- **Speak**: talk about a random topic for 30–90 seconds and get feedback on grammar, vocabulary, structure and filler words.
- **Review**: saved words and corrections come back with spaced repetition.

Reading progress, saved words and recordings are stored in your browser (IndexedDB) on each device.

## Run it on your Mac

Node.js is installed in `~/.local/node`. Add it to your PATH once:

```bash
echo 'export PATH="$HOME/.local/node/bin:$PATH"' >> ~/.zprofile && source ~/.zprofile
```

Then:

```bash
npm install
cp .env.example .env.local   # then add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000. Use **Google Chrome** for the microphone features.

Everything except the AI coach works without an API key: reading, listening, word colours when you read aloud, dictionary meanings, and Review.

## The AI coach

The coach uses the Claude API (`claude-opus-5` by default). A Claude Pro subscription does **not** include API access. Create a key at https://console.anthropic.com and add credit. Word explanations and page summaries are cached in the browser, so each is only paid for once.

## Put it online (Vercel)

1. Push this repo to GitHub.
2. On https://vercel.com, import the repo (framework: Next.js, no settings to change).
3. In **Settings → Environment Variables**, add `ANTHROPIC_API_KEY` and `APP_PASSWORD`.
4. Deploy. The first time you use the coach, the site will ask for the password.

## Rebuilding the books

Books are already built into `public/books` and `src/data/library.json`. To change the list, edit `scripts/catalog.mjs`, then run:

```bash
node scripts/build-books.mjs              # all books
node scripts/build-books.mjs gitanjali    # just one
```

Sources: [Standard Ebooks](https://standardebooks.org) (text and cover art, CC0) and [Project Gutenberg](https://www.gutenberg.org).
