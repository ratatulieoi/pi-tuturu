# pi-tuturu

A small [Pi](https://github.com/badlogic/pi-mono) package that plays a completion sound when the agent finishes.

It includes one bundled sound: `tuturu`.

## Features

- Plays a sound on `agent_end`
- `/tuturu` configuration UI in Pi settings-list style
- Select sound, volume, test sound, or show config path
- Footer/dashboard status when enabled: `tuturu : 60%`
- `random` mode for custom sound collections

## Install

From npm:

```bash
pi install npm:pi-tuturu
```

From GitHub:

```bash
pi install git:github.com/ratatulieoi/pi-tuturu
```

Then restart Pi or run:

```txt
/reload
```

## Usage

Open the configuration UI:

```txt
/tuturu
```

Controls:

- Arrow keys: move
- Enter/Space: cycle value
- Type: search
- Esc: close

## Configuration

Config file:

```txt
pi-tuturu.json
```

Default:

```json
{
  "sound": "tuturu",
  "volume": 60,
  "sounds": {
    "tuturu": "sounds/tuturu.mp3"
  }
}
```

## Add more sounds

Add your files anywhere, then edit `pi-tuturu.json`.

Example with files inside the package:

```json
{
  "sound": "random",
  "volume": 70,
  "sounds": {
    "tuturu": "sounds/tuturu.mp3",
    "correct": "sounds/correct.mp3",
    "done": "sounds/done.oga"
  }
}
```

Example with absolute paths:

```json
{
  "sound": "correct",
  "volume": 70,
  "sounds": {
    "tuturu": "sounds/tuturu.mp3",
    "correct": "/home/you/Music/correct.mp3"
  }
}
```

If `sound` is `random`, Pi randomly picks from existing files in `sounds`.

If `sound` is `off`, no dashboard status is shown and no sound plays.

## Requirements

`paplay` must be available. On Arch/CachyOS it is usually provided by PulseAudio/PipeWire Pulse compatibility packages.

Check:

```bash
command -v paplay
```
