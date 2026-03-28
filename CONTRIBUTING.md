# Contributing to Antigravity Mobile Proxy

Thanks for your interest in contributing! 🎉 This project welcomes contributions of all kinds — bug reports, feature ideas, documentation improvements, and code.

## Getting Started

### Prerequisites

- **Node.js 18+** — [Download here](https://nodejs.org)
- **Antigravity IDE** installed on your system
- **Git**

### Setup

```bash
# Clone the repo
git clone https://github.com/Belal33/antigravity-mobile-proxy.git
cd antigravity-mobile-proxy

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The dev server runs at `http://localhost:5555`.

### Useful Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server on port 5555 |
| `npm run lint` | Run ESLint |
| `npm run type-check` | Run TypeScript type checking |
| `npm run build` | Production build |

## How to Contribute

### Reporting Bugs

1. Check if the issue already exists in [GitHub Issues](https://github.com/Belal33/antigravity-mobile-proxy/issues)
2. If not, open a new issue using the **Bug Report** template
3. Include as much detail as possible — OS, Node.js version, error messages, and steps to reproduce

### Suggesting Features

1. Open a new issue using the **Feature Request** template
2. Describe the use case and why it would be valuable

### Submitting Code

1. **Fork** the repository
2. Create a **feature branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. Make your changes
4. Ensure your code passes linting and type checks:
   ```bash
   npm run lint
   npm run type-check
   ```
5. Commit with a clear message:
   ```bash
   git commit -m "feat: add your feature description"
   ```
6. **Push** to your fork and open a **Pull Request**

### Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation changes
- `refactor:` — Code refactoring
- `chore:` — Maintenance tasks

## Project Structure

```
antigravity-mobile-proxy/
├── app/                    # Next.js App Router (pages + API routes)
│   └── api/v1/             # Versioned API endpoints
├── components/             # React UI components
├── hooks/                  # React hooks
├── lib/                    # Server-side services
│   ├── cdp/                # Chrome DevTools Protocol
│   ├── scraper/            # Agent state DOM scraper
│   ├── actions/            # IDE automation
│   └── sse/                # Real-time event streaming
├── bin/cli.js              # CLI entry point
└── public/                 # Static assets
```

## Code Style

- **TypeScript** for all source files
- **ESLint** with Next.js config
- Keep components focused and files under ~300 lines
- Use meaningful variable names — no abbreviations

## Questions?

Open a [Discussion](https://github.com/Belal33/antigravity-mobile-proxy/discussions) or reach out in the issues. We're happy to help!
