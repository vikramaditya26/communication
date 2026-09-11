# Vaani

A reading app for practicing English. It has 101 free books, including the ones Osho talks about in *Books I Have Loved*.

- **Reader**: tap a word to hear it and see what it means. Select a sentence to have it explained. Ask for a summary of any page.
- **Read out loud**: read a page and each word turns green if it was clear, or red if it sounded like a different word.
- **Retell**: say what the page was about in your own words and get your grammar corrected.
- **Speak**: talk about a topic for a minute and get feedback.
- **Review**: words and corrections you saved come back as flashcards.

Progress, saved words and recordings are stored in the browser on each device.

## Run it on your Mac

Node.js is installed in `~/.local/node`. Add it to your PATH once:

```bash
echo 'export PATH="$HOME/.local/node/bin:$PATH"' >> ~/.zprofile && source ~/.zprofile
```

Then:

```bash
npm install
cp .env.example .env.local   # then add a key (see below)
npm run dev
```

Open http://localhost:3000 in Chrome. Chrome is needed for the microphone features.

## AI help

Reading, listening, the word colors and the dictionary all work without a key. The AI explanations and feedback need one of these:

| Service | Cost | Where to get a key | Variable |
| --- | --- | --- | --- |
| Google Gemini | Free (daily limit) | https://aistudio.google.com/apikey | `GEMINI_API_KEY` |
| Groq | Free (daily limit) | https://console.groq.com/keys | `GROQ_API_KEY` |
| Claude | Paid | https://console.anthropic.com | `ANTHROPIC_API_KEY` |
| Anything OpenAI-compatible | Varies | | `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` |

Gemini is the one to start with. Adding a Groq key as well gives you a backup for when Gemini's free limit runs out. On Google's free tier, what you send may be used to improve their products.

Answers to word lookups and page summaries are saved in the browser, so asking again doesn't use up requests.

## Put it online (Vercel)

1. Import this repo on https://vercel.com.
2. In **Settings → Environment Variables**, add `GEMINI_API_KEY` (and `APP_PASSWORD` so only you can use it).
3. Redeploy. Environment variables only take effect after a new deployment.

## Changing the books

The books are already built into `public/books` and `src/data/library.json`. To change the list, edit `scripts/catalog.mjs` and run:

```bash
node scripts/build-books.mjs              # all books
node scripts/build-books.mjs gitanjali    # one book
```

Books come from [Standard Ebooks](https://standardebooks.org) and [Project Gutenberg](https://www.gutenberg.org).
