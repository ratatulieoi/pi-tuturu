import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, extname, join } from "node:path";
import { platform } from "node:os";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { SettingsList } from "@mariozechner/pi-tui";
import type { SettingItem, SettingsListTheme } from "@mariozechner/pi-tui";

type TuturuConfig = {
	sound: string;
	volume: number;
	sounds: Record<string, string>;
};

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = join(PACKAGE_DIR, "pi-tuturu.json");
const DEFAULT_CONFIG: TuturuConfig = {
	sound: "tuturu",
	volume: 100,
	sounds: {
		tuturu: join(PACKAGE_DIR, "sounds", "tuturu.wav"),
	},
};
const BASE_OPTIONS = ["tuturu", "random", "off"];
const VOLUME_OPTIONS = ["0", "10", "20", "30", "40", "50", "60", "70", "80", "90", "100", "125", "150"];

function settingsTheme(theme: ExtensionContext["ui"]["theme"]): SettingsListTheme {
	return {
		label: (text, selected) => (selected ? theme.fg("accent", text) : text),
		value: (text, selected) => (selected ? theme.fg("accent", text) : theme.fg("muted", text)),
		description: (text) => theme.fg("dim", text),
		cursor: theme.fg("accent", "→ "),
		hint: (text) => theme.fg("dim", text),
	};
}

function isAbsolutePath(soundPath: string): boolean {
	return soundPath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(soundPath) || soundPath.startsWith("\\\\");
}

function resolveSoundPath(soundPath: string): string {
	return isAbsolutePath(soundPath) ? soundPath : join(PACKAGE_DIR, soundPath);
}

function loadConfig(): TuturuConfig {
	try {
		const parsed = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
		const rawSounds = { ...DEFAULT_CONFIG.sounds, ...(typeof parsed.sounds === "object" && parsed.sounds ? parsed.sounds : {}) };
		const sounds = Object.fromEntries(
			Object.entries(rawSounds).map(([key, value]) => [key, typeof value === "string" ? resolveSoundPath(value) : value]),
		) as Record<string, string>;
		return {
			sound: typeof parsed.sound === "string" ? parsed.sound : DEFAULT_CONFIG.sound,
			volume: normalizeVolume(parsed.volume),
			sounds,
		};
	} catch {
		return DEFAULT_CONFIG;
	}
}

function serializeConfig(config: TuturuConfig): TuturuConfig {
	const sounds = Object.fromEntries(
		Object.entries(config.sounds).map(([key, value]) => [key, value.startsWith(PACKAGE_DIR) ? value.slice(PACKAGE_DIR.length + 1) : value]),
	) as Record<string, string>;
	return { ...config, sounds };
}

function saveConfig(config: TuturuConfig) {
	writeFileSync(CONFIG_FILE, `${JSON.stringify(serializeConfig(config), null, 2)}\n`, "utf-8");
}

function normalizeVolume(value: unknown): number {
	const raw = typeof value === "number" ? value : Number(value ?? 100);
	if (!Number.isFinite(raw)) return 100;
	return Math.max(0, Math.min(150, Math.round(raw)));
}

function availableSoundKeys(config: TuturuConfig): string[] {
	return Object.keys(config.sounds).filter((key) => existsSync(config.sounds[key]));
}

function resolveSound(config: TuturuConfig): string | undefined {
	let selected = config.sound;
	if (selected === "off") return undefined;
	if (selected === "random") {
		const available = availableSoundKeys(config);
		selected = available[Math.floor(Math.random() * available.length)] ?? "complete";
	}
	const file = config.sounds[selected] ?? config.sounds.complete;
	return file && existsSync(file) ? file : undefined;
}

function spawnDetached(command: string, args: string[]) {
	const child = spawn(command, args, {
		detached: true,
		stdio: "ignore",
		windowsHide: true,
	});
	child.on("error", () => undefined);
	child.unref();
}

function powershell(command: string) {
	const encoded = Buffer.from(command, "utf16le").toString("base64");
	spawnDetached("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded]);
}

function play(config: TuturuConfig) {
	const file = resolveSound(config);
	if (!file) return;
	const volume = normalizeVolume(config.volume);
	const os = platform();

	if (os === "darwin") {
		spawnDetached("osascript", ["-e", `set volume output volume ${Math.min(100, volume)}`, "-e", `do shell script "afplay " & quoted form of ${JSON.stringify(file)}`]);
		return;
	}

	if (os === "win32") {
		const escapedFile = file.replace(/'/g, "''");
		if (extname(file).toLowerCase() === ".wav") {
			powershell(`$p = [System.Media.SoundPlayer]::new('${escapedFile}'); $p.Load(); $p.PlaySync();`);
			return;
		}
		powershell(`Add-Type -AssemblyName PresentationCore; $p = New-Object System.Windows.Media.MediaPlayer; $p.Open([Uri]'${escapedFile}'); $p.Volume = ${Math.min(1.5, volume / 100)}; $p.Play(); Start-Sleep -Milliseconds 5000; $p.Close();`);
		return;
	}

	const pulseVolume = Math.round(65536 * (volume / 100));
	spawnDetached("paplay", [`--volume=${pulseVolume}`, file]);
}

function updateStatus(ctx: ExtensionContext) {
	const config = loadConfig();
	ctx.ui.setStatus("pi-tuturu", config.sound === "off" ? undefined : `${config.sound} : ${config.volume}%`);
}

async function configure(ctx: ExtensionContext) {
	await ctx.ui.custom<void>((_tui, theme, _keybindings, done) => {
		let config = loadConfig();
		const soundOptions = Array.from(new Set([...BASE_OPTIONS, ...Object.keys(config.sounds)]))
			.filter((key) => key === "random" || key === "off" || config.sounds[key]);
		const items: SettingItem[] = [
			{
				id: "sound",
				label: "Sound notification",
				description: "Sound to play when pi finishes a run",
				currentValue: config.sound,
				values: soundOptions,
			},
			{
				id: "volume",
				label: "Sound volume",
				description: "Volume for pi completion sounds",
				currentValue: String(config.volume),
				values: VOLUME_OPTIONS,
			},
			{
				id: "test",
				label: "Test sound",
				description: "Play the selected sound once",
				currentValue: "play",
				values: ["play"],
			},
			{
				id: "config",
				label: "Config path",
				description: "Show pi-tuturu config file path",
				currentValue: "show",
				values: ["show"],
			},
		];

		const list = new SettingsList(items, 10, settingsTheme(theme), (id, value) => {
			config = loadConfig();
			if (id === "sound") {
				config.sound = value;
				saveConfig(config);
				updateStatus(ctx);
				ctx.ui.notify(`Tuturu sound: ${value}`, "info");
				return;
			}
			if (id === "volume") {
				config.volume = normalizeVolume(value);
				saveConfig(config);
				updateStatus(ctx);
				ctx.ui.notify(`Tuturu volume: ${config.volume}%`, "info");
				return;
			}
			if (id === "test") {
				play(config);
				ctx.ui.notify(`Tuturu test: ${config.sound} at ${config.volume}%`, "info");
				return;
			}
			ctx.ui.notify(CONFIG_FILE, "info");
		}, () => done(), { enableSearch: true });

		return {
			render(width: number): string[] {
				return list.render(width);
			},
			handleInput(data: string) {
				list.handleInput(data);
			},
			invalidate() {
				list.invalidate();
			},
		};
	});
}

export default function piTuturu(pi: ExtensionAPI) {
	pi.registerCommand("tuturu", {
		description: "Configure pi-tuturu completion sound notifications",
		handler: async (_args, ctx) => configure(ctx),
	});

	pi.on("session_start", async (_event, ctx) => {
		updateStatus(ctx);
	});

	pi.on("agent_end", async () => {
		play(loadConfig());
	});
}
