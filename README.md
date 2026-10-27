# Tough Client (TypeScript)

A local Express app that forwards completion requests to the upstream server, plus a simulator that sends traffic to it.

You only need Node.js.

## Setup

Requires Node.js 18 or newer. Node 20 matches `.nvmrc`.

```bash
npm install
```

## Run

Use two terminals.

Start the server (it restarts when you save `main.ts`):

```bash
npm run server
```

In the other terminal, start the simulator. Replace `your_name` with your name:

```bash
npm run sim -- your_name
```

The simulator runs for 60 seconds against `http://localhost:8000/completion`. Stop either process with Ctrl+C.
