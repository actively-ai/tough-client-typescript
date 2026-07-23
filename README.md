# Tough Client (TypeScript)

## Requirements

- Node.js 18+ (uses the built-in `fetch`)

## Installation

```bash
npm install
```

## Usage

```bash
# Run the server
npm run server

# Run the simulator (in a second terminal)
npm run sim -- <your_name>
```

The simulator also accepts an optional server URL and duration (in seconds):

```bash
npm run sim -- <your_name> http://localhost:8000/completion 60
```
