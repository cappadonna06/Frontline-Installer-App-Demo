import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Frontline Installer App – Interactive Demo
 * React prototype intended to transition cleanly from demo → production.
 */

const STEPS = ["QR Scan", "Station", "System", "Network", "Tests", "Done"] as const;

type Step = (typeof STEPS)[number];

type WifiNetwork = {
  ssid: string;
  strength: 1 | 2 | 3 | 4 | 5;
  security: "WPA2" | "WPA3" | "Open";
};

type ZoneType = "Roof" | "Eave" | "Roof + Eave" | "Perimeter";

type Zone = {
  id: number;
  type: ZoneType;
  name: string;
};

type DiagnosticStatus = "success" | "warning" | "error";

type DiagCardModel = {
  id: string;
  title: string;
  icon: string;
  status: DiagnosticStatus;
  summaryPrimary: string;
  summarySecondary: string;
  details: Array<{ label: string; value: string }>;
  remediation?: {
    title: string;
    actions: Array<{ label: string; kind: "goToNetwork" | "openCheatSheet" }>;
  };
};

type RuleStatus = "green" | "yellow" | "red";

type RuleEntry = {
  id: string;
  title: string;
  intent: string;
  green: string[];
  yellow: string[];
  red: string[];
  recommendedActions: string[];
};

const RULEBOOK: RuleEntry[] = [
  {
    id: "ethernet",
    title: "Ethernet",
    intent: "Proves wired connectivity is stable enough for cloud sync and commissioning.",
    green: [
      "Link detected = Yes (ethtool)",
      "Duplex = Full (ethtool)",
      "IPv4 address present (ifconfig)",
      "Internet reachable = Online (ethernet-check)",
      "Packet loss ≤ 2% (ethernet-check)",
    ],
    yellow: [
      "Packet loss > 2% and ≤ 10%",
      "Speed lower than expected (e.g., 100 Mb/s when Gigabit is available)",
      "RX drops increasing (but errors remain 0)",
    ],
    red: [
      "Link detected = No",
      "No IPv4 address",
      "Internet unreachable",
      "Packet loss > 10%",
      "RX/TX errors > 0",
      "Duplex mismatch or link flapping",
    ],
    recommendedActions: [
      "Reseat/replace Ethernet cable with known-good cable",
      "Try a different router/switch port",
      "Re-run diagnostics",
      "If still failing: use Wi‑Fi/Cellular and flag controller/cable/router for follow-up",
    ],
  },
  {
    id: "wifi",
    title: "Wi‑Fi",
    intent: "Verifies Wi‑Fi provisioning and link quality for primary or backup connectivity.",
    green: ["Connected to SSID", "Internet reachable", "Strength ≥ 60/100"],
    yellow: ["Wi‑Fi disabled (optional)", "Strength 30–59/100", "High latency or intermittent loss"],
    red: ["Not connected (when expected)", "No internet reachability", "Technology disabled unexpectedly"],
    recommendedActions: [
      "Use Current Wi‑Fi via Matter (fast path)",
      "Provision Selected Wi‑Fi via Matter",
      "Move closer / choose stronger SSID",
      "Confirm passcode",
      "Use Ethernet/Cellular as fallback",
    ],
  },
  {
    id: "cellular",
    title: "Cellular",
    intent: "Verifies cellular modem is registered and usable as backup or primary uplink.",
    green: ["Internet reachable", "Packet loss ≤ 2%", "Signal ≥ 40/100"],
    yellow: ["Signal 20–39/100", "Latency high (still usable)", "Intermittent loss"],
    red: ["Internet unreachable", "No provider / no session", "Packet loss > 10%"],
    recommendedActions: [
      "Check antenna/placement",
      "Verify SIM active",
      "Reboot modem/controller",
      "Escalate to support if still no session",
    ],
  },
  {
    id: "satellite",
    title: "Satellite",
    intent: "Confirms satellite backup is available when enabled.",
    green: ["Enabled and ready", "Recent successful contact"],
    yellow: ["Enabled but not currently connected", "Provisioned but idle"],
    red: ["Enabled but offline / fault", "No modem detected"],
    recommendedActions: [
      "Confirm satellite backup enabled",
      "Check antenna placement",
      "Re-run satellite diagnostic",
      "Escalate if modem not detected",
    ],
  },
  {
    id: "power",
    title: "Power",
    intent: "Ensures controller supply voltage is within safe operating range.",
    green: ["12.0–15.0 V"],
    yellow: ["11.0–11.9 V", "15.1–16.0 V"],
    red: ["< 11.0 V", "> 16.0 V"],
    recommendedActions: [
      "Check power supply and wiring",
      "Verify battery/solar configuration",
      "Measure with multimeter if readings look wrong",
    ],
  },
  {
    id: "manifold",
    title: "Manifold Pressure",
    intent: "Indicates pressure on the distribution/manifold side.",
    green: ["Pressure within expected operating range"],
    yellow: ["Pressure marginal (near limits)", "Pressure unstable"],
    red: ["Pressure too low for operation", "Pressure too high / unsafe"],
    recommendedActions: [
      "Check pump/valves state",
      "Verify supply and filters",
      "Re-run pressure test",
    ],
  },
  {
    id: "source",
    title: "Source Pressure",
    intent: "Indicates supply pressure available from the water source.",
    green: ["Source pressure within expected range"],
    yellow: ["Low but usable", "Fluctuating"],
    red: ["No pressure / very low", "Unstable / unreliable source"],
    recommendedActions: [
      "Check supply valve/source",
      "Confirm tank level / municipal pressure",
      "Inspect intake/strainer",
    ],
  },
  {
    id: "cloud",
    title: "Cloud Sync",
    intent: "Confirms controller can reach Frontline cloud services reliably.",
    green: ["Ping succeeds", "Recent sync timestamp"],
    yellow: ["Slow ping", "Delayed sync"],
    red: ["Cannot reach endpoint", "No sync"],
    recommendedActions: [
      "Fix underlying network (Ethernet/Wi‑Fi/Cellular)",
      "Re-run diagnostics",
      "Confirm endpoint configured",
    ],
  },
  {
    id: "firmware",
    title: "Firmware",
    intent: "Shows installed firmware version and whether an update is recommended.",
    green: ["Version current / supported"],
    yellow: ["Update available (recommended)"],
    red: ["Unsupported / blocked version"],
    recommendedActions: [
      "Schedule update",
      "Confirm update window and connectivity",
      "Escalate if version is blocked",
    ],
  },
];

function wifiChannelFromFreqMHz(freqMHz: number | null): string | null {
  if (!freqMHz) return null;
  // 2.4 GHz: channel = (freq - 2407) / 5
  // 5 GHz: channel = (freq - 5000) / 5
  if (freqMHz >= 2412 && freqMHz <= 2484) {
    const ch = Math.round((freqMHz - 2407) / 5);
    return Number.isFinite(ch) ? String(ch) : null;
  }
  if (freqMHz >= 5000 && freqMHz <= 5900) {
    const ch = Math.round((freqMHz - 5000) / 5);
    return Number.isFinite(ch) ? String(ch) : null;
  }
  return null;
}

function wifiStrengthGlyph(pct: number | null) {
  // 0–100 mapped to 5 bars. Installer-friendly.
  if (pct === null || !Number.isFinite(pct)) return "▯▯▯▯▯";
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const filled = Math.max(0, Math.min(5, Math.round(clamped / 20)));
  return "▮".repeat(filled) + "▯".repeat(5 - filled);
}

export default function FrontlineInstallerApp() {
  const [stepIndex, setStepIndex] = useState(0);

  // Station info (persist across steps)
  const [customerName, setCustomerName] = useState("Will Durness");
  const [installLocation, setInstallLocation] = useState("10555 Quality Road; Quality, CA");
  const [installDate, setInstallDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // Commissioning / identity
  const [serial, setSerial] = useState<string | null>(null);
  const [matterPaired, setMatterPaired] = useState(false);
  const [matterAttested, setMatterAttested] = useState(false);

  // Network provisioning (demo)
  const [matterWifiProvisioned, setMatterWifiProvisioned] = useState(false);
  const [matterProvisionedSsid, setMatterProvisionedSsid] = useState<string | null>(null);

  const wifiNetworks: WifiNetwork[] = useMemo(
    () => [
      { ssid: "Southern Cousin", strength: 5, security: "WPA2" },
      { ssid: "Robust Debt", strength: 4, security: "WPA2" },
      { ssid: "Deranged Love", strength: 2, security: "WPA2" },
    ],
    []
  );

  // Demo: assume installer device is on this SSID
  const pairingDeviceSsid = "Southern Cousin";

  const [primaryInterface, setPrimaryInterface] = useState<"Ethernet" | "Wi-Fi" | "Cellular">("Ethernet");
  const [selectedWifi, setSelectedWifi] = useState(wifiNetworks[0]?.ssid ?? pairingDeviceSsid);
  const [wifiPassword, setWifiPassword] = useState("");
  const [usePairingDeviceNetwork, setUsePairingDeviceNetwork] = useState(true);
  const [cellularBackup, setCellularBackup] = useState<"Yes" | "No">("Yes");
  const [satelliteBackup, setSatelliteBackup] = useState<"Yes" | "No">("Yes");

  // System configuration
  const [hhcType, setHhcType] = useState("MP3");
  const [foamInstalled, setFoamInstalled] = useState<"Yes" | "No">("Yes");

  // Hydraulics / zones
  const [drainCycle, setDrainCycle] = useState<"Yes" | "No">("Yes");
  const [zones, setZones] = useState<Zone[]>([{ id: 1, type: "Roof", name: "Roof Zone 1" }]);

  // Station defaults
  const todayISO = installDate;

  // Diagnostics UI state (accordion: one open at a time)
  const [openDiagId, setOpenDiagId] = useState<string | null>(null);

  // Diagnostics rulebook modal
  const [rulebookOpen, setRulebookOpen] = useState(false);
  const [rulebookFocus, setRulebookFocus] = useState<string | null>(null);

  const step: Step = STEPS[stepIndex] ?? "QR Scan";

  const next = () => setStepIndex((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStepIndex((s) => Math.max(s - 1, 0));

  const goToStep = (target: Step) => {
    const idx = STEPS.indexOf(target);
    if (idx >= 0) setStepIndex(idx);
  };

  const simulateQrScan = () => {
    setSerial(`3600${Math.floor(Math.random() * 10000)}`);
    setMatterPaired(true);
    setMatterAttested(true);
  };

  const provisionViaMatterUsingCurrentWifi = () => {
    setPrimaryInterface("Wi-Fi");
    setUsePairingDeviceNetwork(true);
    setSelectedWifi(pairingDeviceSsid);
    setMatterWifiProvisioned(true);
    setMatterProvisionedSsid(pairingDeviceSsid);
  };

  const chooseWifi = (ssid: string) => {
    setSelectedWifi(ssid);
    setPrimaryInterface("Wi-Fi");
    setUsePairingDeviceNetwork(ssid === pairingDeviceSsid);
    // Selecting is not provisioning
    setMatterWifiProvisioned(false);
    setMatterProvisionedSsid(null);
  };

  const addZone = () => {
    setZones((prev) => {
      const id = prev.length + 1;
      return [...prev, { id, type: "Roof", name: `Roof Zone ${id}` }];
    });
  };

  // Demo firmware version (wire from controller later)
  const firmwareVersion = "r3.0.8";
  const firmwareUpdateAvailable = true;
  const firmwareSupported = true;

  // Demo voltage (wire from controller later)
  const voltage = 13.4;

  const powerStatus: DiagnosticStatus =
    voltage >= 12 && voltage <= 15
      ? "success"
      : voltage >= 11 && voltage < 12
      ? "warning"
      : voltage > 15 && voltage <= 16
      ? "warning"
      : "error";

  // -------------------------
  // Dummy DATASETS (replace with parsed CLI results later)
  // -------------------------

  // Ethernet: aligned with your provided good dataset (ethernet-check + ifconfig + ethtool)
  const ethInternet = "online";
  const ethState = "online";
  const ethIPv4 = true;
  const ethIPv6 = true;
  const ethDns = "192.168.4.1, fdd5:f30b:67fe:1::1";
  const ethIp = "192.168.7.31";
  const ethMask = "255.255.252.0";
  const ethSpeed = "1000 Mb/s";
  const ethDuplex = "Full";
  const ethAutoneg = "On";
  const ethLinkDetected = "Yes";
  const ethRxErrors = 0;
  const ethTxErrors = 0;
  const ethRxDropped = 76;

  // Wi‑Fi: uses 0–100 strength (per wifi-check)
  const wifiTechPowered = true;
  const wifiConnected = true;
  const wifiSsid: string | null = pairingDeviceSsid; // "Southern Cousin"
  const wifiStrengthPercent: number | null = 100; // wifi-check: 100/100
  const wifiStrengthLabel: string | null = "strong";
  const wifiSignalDbm: number | null = null; // advanced (optional)
  const wifiFreqMHz: number | null = 2412;
  const wifiChannel: string | null = wifiChannelFromFreqMHz(wifiFreqMHz);
  const wifiTxBitrate: string | null = "144.4 MBit/s";
  const wifiIpV4: string | null = "192.168.7.29";
  const wifiIpV6Present = true;
  const wifiDns: string | null = "192.168.4.1, fdd5:f30b:67fe:1::1";
  const wifiInternetReachability: "online" | "offline" | "unknown" = "online";
  const wifiPacketLossPct: number | null = 0;
  const wifiAvgLatencyMs: number | null = 26.2;
  const wifiCheckResult = "Success";

  // Cellular (successful example)
  const cellInternetReachability: "online" | "offline" | "unknown" = "online";
  const cellState: "ready" | "idle" | "offline" = "ready";
  const cellProvider = "311480";
  const cellProviderName = "Verizon";
  const cellStrength = 60;
  const cellStrengthLabel = "average";
  const cellIPv4 = true;
  const cellIPv6 = false;
  const cellDns = "198.224.169.135, 198.224.171.135";
  const cellPacketLossPct = 0;
  const cellAvgLatencyMs = 333;
  const cellImei = "356789012345678";
  const cellIccid = "89014103211118510720";

  // Satellite (demo)
  const satEnabled = satelliteBackup === "Yes";
  const satStatus: "ready" | "offline" | "not configured" = satEnabled ? "offline" : "not configured";
  const satImei = "357111112222333";
  const satLastContact = satEnabled ? "—" : "Not enabled";

  // Pressures (demo)
  const manifoldPsi = 45;
  const sourcePsi = 62;
  const manifoldExpected = "30–80 PSI";
  const sourceExpected = "30–80 PSI";

  const manifoldStatus: DiagnosticStatus = manifoldPsi >= 30 && manifoldPsi <= 80 ? "success" : manifoldPsi >= 20 && manifoldPsi < 30 ? "warning" : "error";
  const sourceStatus: DiagnosticStatus = sourcePsi >= 30 && sourcePsi <= 80 ? "success" : sourcePsi >= 20 && sourcePsi < 30 ? "warning" : "error";

  // Cloud (demo)
  const cloudReachable = true;
  const cloudLastSync = "Just now";
  const cloudPingMs = 42;

  const cloudStatus: DiagnosticStatus = cloudReachable ? (cloudPingMs <= 250 ? "success" : "warning") : "error";

  // Firmware (demo)
  const firmwareStatus: DiagnosticStatus = !firmwareSupported ? "error" : firmwareUpdateAvailable ? "warning" : "success";

  const diagCards: DiagCardModel[] = useMemo(() => {
    // Wi‑Fi provisioning logic
    const wifiProvisioned = Boolean(matterWifiProvisioned && matterProvisionedSsid);

    // Wi‑Fi status logic
    // - Provisioned + reachable => success
    // - Disabled/off => warning (not necessarily broken)
    // - Connected but offline => warning
    // - Powered but not connected when expected => error
    const wifiStatus: DiagnosticStatus = wifiProvisioned
      ? wifiInternetReachability === "online"
        ? "success"
        : "warning"
      : !wifiTechPowered
      ? "warning"
      : wifiConnected && wifiInternetReachability === "online"
      ? "success"
      : wifiConnected && wifiInternetReachability !== "online"
      ? "warning"
      : "error";

    const wifiSummaryPrimary =
      wifiStatus === "success" ? "Connected" : wifiStatus === "warning" ? "Disabled / Optional" : "Not Connected";

    const wifiStrengthText =
      wifiStrengthLabel ??
      (wifiStrengthPercent !== null
        ? wifiStrengthPercent >= 75
          ? "strong"
          : wifiStrengthPercent >= 50
          ? "good"
          : wifiStrengthPercent >= 25
          ? "weak"
          : "poor"
        : null);

    const wifiPrimarySsid = (wifiProvisioned ? matterProvisionedSsid : wifiSsid) ?? null;

    const wifiSignalLabel =
      wifiStrengthPercent !== null
        ? `${wifiStrengthPercent}/100`
        : wifiSignalDbm !== null
        ? `${wifiSignalDbm} dBm`
        : "—";

    const wifiSummarySecondary = wifiPrimarySsid
      ? `${wifiPrimarySsid} • ${wifiStrengthGlyph(wifiStrengthPercent)} ${wifiSignalLabel}${
          wifiStrengthText ? ` (${wifiStrengthText})` : ""
        }`
      : !wifiTechPowered
      ? "Wi‑Fi disabled"
      : "No SSID connected";

    // Ethernet status logic (starter): if link detected + internet online + no errors => success
    const ethStatus: DiagnosticStatus =
      ethLinkDetected === "Yes" && ethInternet === "online" && ethRxErrors === 0 && ethTxErrors === 0
        ? "success"
        : ethLinkDetected !== "Yes" || ethInternet !== "online"
        ? "error"
        : "warning";

    // Cellular status logic
    const cellStatus: DiagnosticStatus =
      cellInternetReachability === "online" && cellPacketLossPct <= 2
        ? cellStrength >= 40
          ? "success"
          : "warning"
        : cellInternetReachability !== "online"
        ? "error"
        : "warning";

    // Satellite status logic
    const satelliteStatus: DiagnosticStatus =
      satEnabled && satStatus === "ready" ? "success" : satEnabled && satStatus === "offline" ? "warning" : "warning";

    return [
      {
        id: "ethernet",
        title: "Ethernet",
        icon: "🌐",
        status: ethStatus,
        summaryPrimary: ethStatus === "success" ? "Connected" : ethStatus === "warning" ? "Degraded" : "Offline",
        summarySecondary: `${ethIp} • ${ethSpeed} • Link ${ethLinkDetected}`,
        details: [
          { label: "Internet reachability", value: ethInternet },
          { label: "Ethernet state", value: ethState },
          { label: "IPv4", value: ethIPv4 ? "Yes" : "No" },
          { label: "IPv6", value: ethIPv6 ? "Yes" : "No" },
          { label: "DNS", value: ethDns },
          { label: "IPv4 Address", value: ethIp },
          { label: "Netmask", value: ethMask },
          { label: "Speed", value: ethSpeed },
          { label: "Duplex", value: ethDuplex },
          { label: "Auto-negotiation", value: ethAutoneg },
          { label: "Link detected", value: ethLinkDetected },
          { label: "RX errors", value: String(ethRxErrors) },
          { label: "TX errors", value: String(ethTxErrors) },
          { label: "RX dropped", value: String(ethRxDropped) },
        ],
      },
      {
        id: "wifi",
        title: "Wi‑Fi",
        icon: "📶",
        status: wifiStatus,
        summaryPrimary: wifiSummaryPrimary,
        summarySecondary: wifiSummarySecondary,
        details: [
          { label: "Technology powered", value: wifiTechPowered ? "True" : "False" },
          { label: "Connected", value: wifiConnected ? "True" : "False" },
          { label: "Provisioned via Matter", value: wifiProvisioned ? "Yes" : "No" },
          { label: "SSID", value: wifiPrimarySsid ?? "—" },
          {
            label: "Strength",
            value:
              wifiStrengthPercent !== null
                ? `${wifiStrengthGlyph(wifiStrengthPercent)} ${wifiStrengthPercent}/100${
                    wifiStrengthText ? ` (${wifiStrengthText})` : ""
                  }`
                : "—",
          },
          { label: "Internet reachable", value: wifiInternetReachability },
          { label: "IPv4 Address", value: wifiIpV4 ?? "—" },
          { label: "IPv6", value: wifiIpV6Present ? "Present" : "No" },
          { label: "DNS", value: wifiDns ?? "—" },
          { label: "Packet loss", value: wifiPacketLossPct !== null ? `${wifiPacketLossPct}%` : "—" },
          { label: "Avg latency", value: wifiAvgLatencyMs !== null ? `${wifiAvgLatencyMs} ms` : "—" },
          { label: "Frequency", value: wifiFreqMHz !== null ? `${wifiFreqMHz} MHz` : "—" },
          { label: "Channel", value: wifiChannel ?? "—" },
          { label: "TX bitrate", value: wifiTxBitrate ?? "—" },
          { label: "Signal (advanced)", value: wifiSignalDbm !== null ? `${wifiSignalDbm} dBm` : "—" },
          { label: "wifi-check", value: wifiCheckResult },
        ],
        remediation:
          wifiStatus === "error"
            ? {
                title: "Action Required",
                actions: [
                  { label: "Configure Wi‑Fi Network", kind: "goToNetwork" },
                  { label: "Wi‑Fi Rulebook", kind: "openCheatSheet" },
                ],
              }
            : wifiStatus === "warning"
            ? {
                title: "Optional",
                actions: [{ label: "Enable / Configure Wi‑Fi (optional backup)", kind: "goToNetwork" }],
              }
            : undefined,
      },
      {
        id: "cellular",
        title: "Cellular",
        icon: "📱",
        status: cellStatus,
        summaryPrimary: cellStatus === "success" ? "Connected" : cellStatus === "warning" ? "Degraded" : "Offline",
        summarySecondary: `${cellProviderName} • ${wifiStrengthGlyph(cellStrength)} ${cellStrength}/100 (${cellStrengthLabel})`,
        details: [
          { label: "Internet reachability", value: cellInternetReachability },
          { label: "Cellular state", value: cellState },
          { label: "Provider", value: `${cellProviderName} (${cellProvider})` },
          { label: "Strength", value: `${wifiStrengthGlyph(cellStrength)} ${cellStrength}/100 (${cellStrengthLabel})` },
          { label: "IPv4", value: cellIPv4 ? "Yes" : "No" },
          { label: "IPv6", value: cellIPv6 ? "Yes" : "No" },
          { label: "DNS", value: cellDns },
          { label: "Packet loss", value: `${cellPacketLossPct}%` },
          { label: "Avg latency", value: `${cellAvgLatencyMs} ms` },
          { label: "IMEI", value: cellImei },
          { label: "ICCID", value: cellIccid },
        ],
      },
      {
        id: "satellite",
        title: "Satellite",
        icon: "🛰️",
        status: satelliteStatus,
        summaryPrimary: satEnabled ? (satStatus === "ready" ? "Ready" : "Offline") : "Not Configured",
        summarySecondary: satEnabled ? "Backup link" : "Not enabled",
        details: [
          { label: "Enabled", value: satEnabled ? "Yes" : "No" },
          { label: "Status", value: satStatus },
          { label: "Modem IMEI", value: satEnabled ? satImei : "—" },
          { label: "Last successful contact", value: satLastContact },
        ],
      },
      {
        id: "power",
        title: "Power",
        icon: "🔋",
        status: powerStatus,
        summaryPrimary: powerStatus === "success" ? "Normal" : powerStatus === "warning" ? "Marginal" : "Out of range",
        summarySecondary: `${voltage.toFixed(1)} V`,
        details: [
          { label: "Voltage", value: `${voltage.toFixed(1)} V` },
          { label: "Expected", value: "12.0–15.0 V" },
          { label: "Rule", value: "Green when within expected range" },
        ],
      },
      {
        id: "manifold",
        title: "Manifold Pressure",
        icon: "🧯",
        status: manifoldStatus,
        summaryPrimary: manifoldStatus === "success" ? "Normal" : manifoldStatus === "warning" ? "Marginal" : "Low",
        summarySecondary: `${manifoldPsi} PSI`,
        details: [
          { label: "Pressure", value: `${manifoldPsi} PSI` },
          { label: "Expected", value: manifoldExpected },
          { label: "Last test", value: "Just now" },
        ],
      },
      {
        id: "source",
        title: "Source Pressure",
        icon: "🚰",
        status: sourceStatus,
        summaryPrimary: sourceStatus === "success" ? "Normal" : sourceStatus === "warning" ? "Marginal" : "Low",
        summarySecondary: `${sourcePsi} PSI`,
        details: [
          { label: "Pressure", value: `${sourcePsi} PSI` },
          { label: "Expected", value: sourceExpected },
          { label: "Source type", value: "Municipal" },
          { label: "Stability", value: "Steady" },
        ],
      },
      {
        id: "cloud",
        title: "Cloud Sync",
        icon: "☁️",
        status: cloudStatus,
        summaryPrimary: cloudStatus === "success" ? "Synced" : cloudStatus === "warning" ? "Delayed" : "Offline",
        summarySecondary: cloudStatus === "success" ? cloudLastSync : `Ping ${cloudPingMs} ms`,
        details: [
          { label: "Endpoint", value: "api.frontline.example" },
          { label: "Last Sync", value: cloudLastSync },
          { label: "Ping Time", value: `${cloudPingMs} ms` },
        ],
      },
      {
        id: "firmware",
        title: "Firmware",
        icon: "🧩",
        status: firmwareStatus,
        summaryPrimary:
          firmwareStatus === "success" ? "Current" : firmwareStatus === "warning" ? "Update available" : "Unsupported",
        summarySecondary: firmwareVersion,
        details: [
          { label: "Version", value: firmwareVersion },
          { label: "Supported", value: firmwareSupported ? "Yes" : "No" },
          { label: "Update available", value: firmwareUpdateAvailable ? "Yes" : "No" },
          { label: "Notes", value: firmwareUpdateAvailable ? "Recommended update" : "—" },
        ],
      },
    ];
  }, [
    cellAvgLatencyMs,
    cellDns,
    cellIccid,
    cellImei,
    cellInternetReachability,
    cellIPv4,
    cellIPv6,
    cellPacketLossPct,
    cellProvider,
    cellProviderName,
    cellState,
    cellStrength,
    cellStrengthLabel,
    ethAutoneg,
    ethDns,
    ethDuplex,
    ethInternet,
    ethIp,
    ethIPv4,
    ethIPv6,
    ethLinkDetected,
    ethMask,
    ethRxDropped,
    ethRxErrors,
    ethSpeed,
    ethState,
    ethTxErrors,
    firmwareStatus,
    firmwareSupported,
    firmwareUpdateAvailable,
    firmwareVersion,
    manifoldExpected,
    manifoldPsi,
    manifoldStatus,
    matterProvisionedSsid,
    matterWifiProvisioned,
    powerStatus,
    satEnabled,
    satImei,
    satLastContact,
    satStatus,
    satelliteBackup,
    sourceExpected,
    sourcePsi,
    sourceStatus,
    voltage,
    wifiAvgLatencyMs,
    wifiChannel,
    wifiCheckResult,
    wifiConnected,
    wifiDns,
    wifiFreqMHz,
    wifiInternetReachability,
    wifiIpV4,
    wifiIpV6Present,
    wifiSignalDbm,
    wifiSsid,
    wifiStrengthLabel,
    wifiStrengthPercent,
    wifiTechPowered,
    wifiTxBitrate,
  ]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <header className="bg-white rounded-xl p-6 shadow">
          <h1 className="text-3xl font-extrabold tracking-widest text-slate-700">FRONTLINE</h1>
          <p className="text-sm tracking-widest text-slate-500">WILDFIRE DEFENSE</p>
          <p className="text-orange-500 font-semibold mt-2">Installer Commissioning App</p>
        </header>

        {/* Progress / Navigation */}
        <div className="bg-white rounded-xl p-4 shadow">
          <div className="flex items-center justify-between gap-4">
            <Button variant="ghost" onClick={back} disabled={stepIndex === 0} className="px-2">
              ← Back
            </Button>
            <div className="flex flex-1 justify-between items-center">
              {STEPS.map((label, i) => (
                <button key={label} type="button" onClick={() => setStepIndex(i)} className="flex-1 text-center">
                  <div
                    className={`mx-auto w-10 h-10 rounded-full flex items-center justify-center font-bold transition ${
                      i < stepIndex
                        ? "bg-green-500 text-white"
                        : i === stepIndex
                        ? "bg-orange-500 text-white"
                        : "bg-slate-200 text-slate-500 hover:bg-slate-300"
                    }`}
                  >
                    {i < stepIndex ? "✓" : i + 1}
                  </div>
                  <div
                    className={`text-xs mt-1 ${i === stepIndex ? "text-orange-500 font-semibold" : "text-slate-500"}`}
                  >
                    {label}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Step Content */}
        <Card className="p-8 shadow">
          {step === "QR Scan" && (
            <section className="space-y-6">
              <h2 className="text-xl font-bold">Scan Controller QR Code</h2>

              <div className="border-2 border-dashed rounded-xl p-8 text-center bg-slate-50">
                <div className="mx-auto w-48 h-64 bg-white rounded-xl border shadow flex flex-col items-center justify-between p-4">
                  <div className="text-xs font-semibold tracking-wide">matter</div>
                  <svg viewBox="0 0 21 21" className="w-32 h-32">
                    <rect width="21" height="21" fill="white" />
                    {[...Array(21)].map((_, y) =>
                      [...Array(21)].map((__, x) => (
                        <rect
                          key={`${x}-${y}`}
                          x={x}
                          y={y}
                          width={1}
                          height={1}
                          fill={(x * y + x + y) % 3 === 0 ? "black" : "white"}
                        />
                      ))
                    )}
                  </svg>
                  <div className="text-sm font-mono">3497-011-2332</div>
                  <div className="text-xs text-slate-500">Mark I Controller</div>
                </div>
                <p className="mt-6 font-semibold">Position QR Code in Frame</p>
                <p className="text-sm text-slate-500">Secure Matter commissioning via BLE</p>
                <Button className="mt-6" onClick={simulateQrScan}>
                  Simulate Scan
                </Button>
              </div>

              {serial && (
                <div className="space-y-3">
                  <div className="flex justify-between bg-slate-100 rounded-lg p-4">
                    <div>
                      <div className="text-xs text-slate-500">Controller Serial</div>
                      <div className="font-mono font-semibold">{serial}</div>
                    </div>
                    <div className="text-green-600 font-semibold">● Paired</div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge ok={matterPaired} label="Matter paired" />
                    <Badge ok={matterAttested} label="Device attestation verified" />
                  </div>
                </div>
              )}

              <Button disabled={!serial} onClick={next} className="w-full">
                Continue Setup
              </Button>
            </section>
          )}

          {step === "Station" && (
            <section className="space-y-6">
              <h2 className="text-xl font-bold">Station Setup</h2>
              <Input label="Customer Name" value={customerName} onChange={(e: any) => setCustomerName(e.target.value)} />
              <Input
                label="Install Location"
                value={installLocation}
                onChange={(e: any) => setInstallLocation(e.target.value)}
              />
              <Input
                label="Installation Date"
                type="date"
                value={todayISO}
                onChange={(e: any) => setInstallDate(e.target.value)}
              />
              <NavButtons back={back} next={next} />
            </section>
          )}

          {step === "System" && (
            <section className="space-y-6">
              <h2 className="text-xl font-bold">System Configuration</h2>

              <Select
                label="Hydraulic Hardware Config"
                options={["MP3", "HP6", "LV2", "Legacy"]}
                value={hhcType}
                onChange={(v) => setHhcType(v)}
              />
              <Select
                label="Foam Module Installed"
                options={["Yes", "No"]}
                value={foamInstalled}
                onChange={(v) => setFoamInstalled(v as "Yes" | "No")}
              />
              <Select
                label="Drain Cycle on Deactivation"
                options={["Yes", "No"]}
                value={drainCycle}
                onChange={(v) => setDrainCycle(v as "Yes" | "No")}
              />

              <div>
                <label className="font-semibold">Zones</label>
                <div className="space-y-3 mt-3">
                  {zones.map((z) => (
                    <div key={z.id} className="bg-slate-100 p-4 rounded-lg flex gap-3">
                      <select
                        className="border rounded p-2"
                        value={z.type}
                        onChange={(e) =>
                          setZones((prev) =>
                            prev.map((pz) => (pz.id === z.id ? { ...pz, type: e.target.value as ZoneType } : pz))
                          )
                        }
                      >
                        <option>Roof</option>
                        <option>Eave</option>
                        <option>Roof + Eave</option>
                        <option>Perimeter</option>
                      </select>
                      <input
                        className="flex-1 border rounded p-2"
                        value={z.name}
                        onChange={(e) =>
                          setZones((prev) => prev.map((pz) => (pz.id === z.id ? { ...pz, name: e.target.value } : pz)))
                        }
                      />
                    </div>
                  ))}
                </div>

                <Button variant="outline" className="mt-4" onClick={addZone}>
                  + Add Zone
                </Button>
              </div>

              <NavButtons back={back} next={next} />
            </section>
          )}

          {step === "Network" && (
            <section className="space-y-6">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight">Network Configuration</h2>
                <p className="text-slate-600 mt-1">Configure network connectivity via Matter secure provisioning</p>
              </div>

              <div className="space-y-3">
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-md text-sm text-slate-700">
                  <span className="font-semibold">Secure Provisioning:</span> Network credentials are encrypted via
                  Matter protocol and stored securely on the controller.
                </div>

                {matterWifiProvisioned && matterProvisionedSsid && (
                  <div className="bg-white border rounded-xl p-4 flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-wider text-slate-500">Current Connection</div>
                      <div className="mt-1 font-semibold text-slate-800">
                        Connected to <span className="text-slate-900">{matterProvisionedSsid}</span>
                      </div>
                      <div className="text-sm text-slate-600 mt-1">Provisioned via Matter pairing (installer device)</div>
                    </div>
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border bg-green-50 text-green-700 border-green-200">
                      ✓ Matter provisioned
                    </span>
                  </div>
                )}

                <div className="bg-slate-50 border rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold">Fast path</div>
                    <div className="text-sm text-slate-600">Use the pairing device’s current Wi‑Fi (like Apple Home)</div>
                  </div>
                  <Button className="bg-orange-500 hover:bg-orange-600" onClick={provisionViaMatterUsingCurrentWifi}>
                    Use Current Wi‑Fi via Matter
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block font-semibold">Primary Network Interface</label>
                <div className="relative">
                  <select
                    className="w-full border rounded-lg p-3 bg-white pr-10"
                    value={primaryInterface}
                    onChange={(e) => setPrimaryInterface(e.target.value as "Ethernet" | "Wi-Fi" | "Cellular")}
                  >
                    <option>Ethernet</option>
                    <option>Wi‑Fi</option>
                    <option>Cellular</option>
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">▾</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block font-semibold">Select Wi‑Fi Network</label>
                  <button
                    type="button"
                    className="text-sm text-orange-600 font-semibold hover:text-orange-700"
                    onClick={() => chooseWifi(pairingDeviceSsid)}
                  >
                    Use pairing device network
                  </button>
                </div>

                <div className="bg-slate-50 rounded-xl border p-4">
                  <div className="space-y-3">
                    {wifiNetworks.map((n) => (
                      <button
                        key={n.ssid}
                        type="button"
                        onClick={() => chooseWifi(n.ssid)}
                        className={`w-full flex items-center justify-between rounded-xl px-3 py-3 text-left hover:bg-white transition border ${
                          selectedWifi === n.ssid ? "bg-white border-orange-300" : "bg-transparent border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <SignalBars strength={n.strength} />
                          <div>
                            <div className="font-semibold text-slate-800">{n.ssid}</div>
                            {n.ssid === pairingDeviceSsid && (
                              <div className="text-xs text-slate-500">Same network as pairing device</div>
                            )}
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-2 rounded-lg bg-blue-600/10 text-blue-700 px-3 py-1 text-xs font-semibold border border-blue-600/20">
                          <span aria-hidden>🔒</span> {n.security}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block font-semibold">Wi‑Fi Passcode</label>
                  <input
                    className="w-full border rounded-lg p-3"
                    value={wifiPassword}
                    onChange={(e) => setWifiPassword(e.target.value)}
                    type="password"
                    placeholder={
                      usePairingDeviceNetwork
                        ? "Enter passcode for pairing device network"
                        : "Enter network passcode"
                    }
                  />
                  <p className="text-xs text-slate-500">
                    Tip: “Use pairing device network” pre-selects the SSID your phone/tablet is on. You’ll still enter
                    the passcode.
                  </p>

                  <div className="pt-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        // Demo-only: clicking "Provision" simulates successful Matter provisioning to the selected SSID.
                        setMatterWifiProvisioned(true);
                        setMatterProvisionedSsid(selectedWifi);
                      }}
                    >
                      Provision Selected Wi‑Fi via Matter
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block font-semibold">Enable Cellular Backup?</label>
                  <div className="relative">
                    <select
                      className="w-full border rounded-lg p-3 bg-white pr-10"
                      value={cellularBackup}
                      onChange={(e) => setCellularBackup(e.target.value as "Yes" | "No")}
                    >
                      <option>Yes</option>
                      <option>No</option>
                    </select>
                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">▾</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block font-semibold">Enable Satellite Backup?</label>
                  <div className="relative">
                    <select
                      className="w-full border rounded-lg p-3 bg-white pr-10"
                      value={satelliteBackup}
                      onChange={(e) => setSatelliteBackup(e.target.value as "Yes" | "No")}
                    >
                      <option>Yes</option>
                      <option>No</option>
                    </select>
                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">▾</div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-2">
                <Button variant="outline" onClick={back} className="w-40">
                  Back
                </Button>
                <Button onClick={next} className="flex-1 bg-orange-500 hover:bg-orange-600">
                  Run Diagnostics
                </Button>
              </div>
            </section>
          )}

          {step === "Tests" && (
            <section className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-extrabold tracking-tight">System Diagnostics</h2>
                  <p className="text-slate-600 mt-1">Running connectivity and system validation tests</p>
                </div>
                <div className="flex items-start gap-4">
                  <Button
                    variant="outline"
                    className="h-9"
                    onClick={() => {
                      setRulebookFocus(null);
                      setRulebookOpen(true);
                    }}
                  >
                    📘 Status Rulebook
                  </Button>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wider text-slate-500">Firmware</div>
                    <div className="font-mono font-semibold">{firmwareVersion}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {diagCards.map((c) => (
                  <DiagnosticCard
                    key={c.id}
                    card={c}
                    open={openDiagId === c.id}
                    onToggle={() => setOpenDiagId((cur) => (cur === c.id ? null : c.id))}
                    onRemediation={(kind) => {
                      if (kind === "goToNetwork") {
                        goToStep("Network");
                        return;
                      }
                      if (kind === "openCheatSheet") {
                        setRulebookFocus(c.id);
                        setRulebookOpen(true);
                      }
                    }}
                  />
                ))}
              </div>

              <div className="flex gap-4 pt-2">
                <Button variant="outline" onClick={back} className="w-40">
                  Back
                </Button>
                <Button onClick={next} className="flex-1 bg-orange-500 hover:bg-orange-600">
                  Complete Setup
                </Button>
              </div>

              {rulebookOpen && <RulebookModal focus={rulebookFocus} onClose={() => setRulebookOpen(false)} />}
            </section>
          )}

          {step === "Done" && (
            <section className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-extrabold tracking-tight">Commissioning Complete</h2>
                <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-500">
                  System successfully configured and validated
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SummaryCard title="Controller Information">
                  <SummaryRow label="Model" value="Frontline Mark I Controller" />
                  <SummaryRow label="Serial Number" value={serial ?? "—"} mono />
                  <SummaryRow label="Firmware" value={firmwareVersion} mono />
                  <SummaryRow label="Matter Paired" value={matterPaired ? "Yes" : "No"} />
                  <SummaryRow label="Attestation" value={matterAttested ? "Verified" : "Not verified"} />
                </SummaryCard>

                <SummaryCard title="Customer & Site">
                  <SummaryRow label="Customer" value={customerName || "—"} />
                  <SummaryRow label="Location" value={installLocation || "—"} />
                  <SummaryRow label="Install Date" value={installDate || "—"} />
                </SummaryCard>

                <SummaryCard title="System Configuration">
                  <SummaryRow label="HHC Type" value={hhcType} />
                  <SummaryRow label="Zones Configured" value={String(zones.length)} />
                  <SummaryRow label="Foam Module" value={foamInstalled} />
                  <SummaryRow label="Drain Type" value={drainCycle === "Yes" ? "Automatic" : "None"} />
                </SummaryCard>

                <SummaryCard title="Network Status">
                  <SummaryRow label="Primary Interface" value={primaryInterface} />
                  <SummaryRow
                    label="Wi‑Fi Network"
                    value={matterProvisionedSsid ?? (selectedWifi || "Not provisioned")}
                  />
                  <SummaryRow label="Overall Status" value={diagCards.some((d) => d.status === "error") ? "Needs attention" : diagCards.some((d) => d.status === "warning") ? "Good" : "Excellent"} />
                </SummaryCard>
              </div>

              <OverallStatusCard diagCards={diagCards} />

              <Button className="w-full">Hand Off to Homeowner</Button>
            </section>
          )}
        </Card>
      </div>
    </div>
  );
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${
        ok ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-50 text-slate-600 border-slate-200"
      }`}
    >
      {ok ? "✓" : "○"} {label}
    </span>
  );
}

function Input({ label, ...props }: any) {
  return (
    <div>
      <label className="block font-semibold mb-1">{label}</label>
      <input className="w-full border rounded p-3" {...props} />
    </div>
  );
}

function Select({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <div>
      <label className="block font-semibold mb-1">{label}</label>
      <select className="w-full border rounded p-3" value={value} onChange={(e) => onChange?.(e.target.value)}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function NavButtons({ back, next }: { back: () => void; next: () => void }) {
  return (
    <div className="flex gap-4">
      <Button variant="outline" onClick={back} className="flex-1">
        Back
      </Button>
      <Button onClick={next} className="flex-1">
        Continue
      </Button>
    </div>
  );
}

function SignalBars({ strength }: { strength: number }) {
  const bars = [1, 2, 3, 4, 5];
  return (
    <div className="flex items-end gap-1" aria-label={`Signal strength ${strength} of 5`}>
      {bars.map((b) => {
        const on = b <= strength;
        const h = 6 + b * 4;
        return (
          <span
            key={b}
            className={`inline-block w-1.5 rounded-sm ${on ? "bg-green-600" : "bg-slate-300"}`}
            style={{ height: h }}
          />
        );
      })}
    </div>
  );
}

function themeForStatus(status: DiagnosticStatus) {
  if (status === "success") {
    return {
      border: "border-green-500",
      dot: "bg-green-500",
      title: "text-slate-900",
      statusText: "text-green-700",
      bg: "bg-green-50/50",
    };
  }
  if (status === "warning") {
    return {
      border: "border-orange-500",
      dot: "bg-orange-500",
      title: "text-slate-900",
      statusText: "text-orange-700",
      bg: "bg-orange-50/50",
    };
  }
  return {
    border: "border-red-500",
    dot: "bg-red-500",
    title: "text-slate-900",
    statusText: "text-red-700",
    bg: "bg-red-50/50",
  };
}

function DiagnosticCard({
  card,
  open,
  onToggle,
  onRemediation,
}: {
  card: DiagCardModel;
  open: boolean;
  onToggle: () => void;
  onRemediation: (kind: "goToNetwork" | "openCheatSheet") => void;
}) {
  const t = themeForStatus(card.status);

  return (
    <div className={`rounded-2xl border-2 bg-white shadow-sm overflow-hidden ${t.border}`}>
      <button type="button" onClick={onToggle} className={`w-full text-left p-5 ${t.bg}`} aria-expanded={open}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="text-2xl leading-none mt-0.5">{card.icon}</div>
            <div>
              <div className={`font-bold text-lg ${t.title}`}>{card.title}</div>
              <div className={`mt-1 font-semibold ${t.statusText}`}>{card.summaryPrimary}</div>
              <div className="mt-1 font-mono text-sm text-slate-700">{card.summarySecondary}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full ${t.dot}`} aria-label={card.status} />
            <span className="text-slate-500">{open ? "▴" : "▾"}</span>
          </div>
        </div>
      </button>

      {open && (
        <div className="p-5 bg-white">
          <div className="space-y-2">
            {card.details.map((d) => (
              <div key={d.label} className="flex items-center justify-between gap-4 text-sm">
                <span className="text-slate-600">{d.label}</span>
                <span className="font-mono text-slate-900">{d.value}</span>
              </div>
            ))}
          </div>

          {card.remediation && (
            <div className="mt-4 border-t pt-4">
              <div className="text-sm font-semibold text-slate-900">⚠️ {card.remediation.title}</div>
              <div className="mt-2 space-y-2">
                {card.remediation.actions.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    className="w-full flex items-center justify-between rounded-lg border bg-white px-3 py-2 hover:bg-slate-50"
                    onClick={() => onRemediation(a.kind)}
                  >
                    <span className="text-sm font-semibold text-slate-800">{a.label}</span>
                    <span className="text-slate-500">→</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RulePill({ label, status }: { label: string; status: RuleStatus }) {
  const cls =
    status === "green"
      ? "border-green-300 bg-green-50 text-green-800"
      : status === "yellow"
      ? "border-orange-300 bg-orange-50 text-orange-800"
      : "border-red-300 bg-red-50 text-red-800";
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

function RuleSection({ title, items, status }: { title: string; items: string[]; status: RuleStatus }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{title}</div>
        <RulePill label={status.toUpperCase()} status={status} />
      </div>
      <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
        {items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function SummaryCard({ title, children }: { title: string; children: any }) {
  return (
    <div className="rounded-2xl border bg-white shadow-sm p-5">
      <div className="text-sm font-extrabold tracking-tight text-slate-900">{title}</div>
      <div className="mt-4 space-y-2">{children}</div>
    </div>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={mono ? "font-mono text-slate-900" : "text-slate-900"}>{value}</span>
    </div>
  );
}

function OverallStatusCard({ diagCards }: { diagCards: DiagCardModel[] }) {
  const hasError = diagCards.some((d) => d.status === "error");
  const hasWarning = diagCards.some((d) => d.status === "warning");

  const statusLabel = hasError ? "Needs Attention" : hasWarning ? "Good (with advisories)" : "Excellent";
  const statusDot = hasError ? "bg-red-500" : hasWarning ? "bg-orange-500" : "bg-green-500";
  const statusBg = hasError ? "bg-red-50" : hasWarning ? "bg-orange-50" : "bg-green-50";
  const statusBorder = hasError ? "border-red-200" : hasWarning ? "border-orange-200" : "border-green-200";

  const topIssues = diagCards
    .filter((d) => d.status !== "success")
    .slice(0, 3)
    .map((d) => `${d.title}: ${d.summaryPrimary}`);

  return (
    <div className={`rounded-2xl border shadow-sm p-5 ${statusBg} ${statusBorder}`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-extrabold tracking-tight text-slate-900">Overview</div>
          <div className="mt-1 text-slate-700">Commissioning summary and current health</div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${statusDot}`} aria-hidden />
          <span className="font-semibold text-slate-900">{statusLabel}</span>
        </div>
      </div>

      <div className="mt-4 space-y-1 text-sm text-slate-700">
        {topIssues.length === 0 ? <div>• All diagnostics passed.</div> : topIssues.map((n) => <div key={n}>• {n}</div>)}
      </div>
    </div>
  );
}

function RulebookModal({ focus, onClose }: { focus: string | null; onClose: () => void }) {
  const [selectedId, setSelectedId] = useState<string>(focus ?? "ethernet");

  useEffect(() => {
    if (focus) setSelectedId(focus);
  }, [focus]);

  const selected = RULEBOOK.find((r) => r.id === selectedId) ?? RULEBOOK[0];

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 top-10 mx-auto max-w-4xl px-4">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">Diagnostics Rulebook</div>
              <div className="text-lg font-extrabold text-slate-900">Red / Yellow / Green Criteria</div>
            </div>
            <Button variant="outline" className="h-9" onClick={onClose}>
              Close
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3">
            <div className="md:col-span-1 border-b md:border-b-0 md:border-r bg-slate-50">
              <div className="p-4">
                <div className="text-sm font-semibold text-slate-700">Systems</div>
                <div className="mt-3 space-y-2">
                  {RULEBOOK.map((r) => {
                    const active = r.id === selectedId;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedId(r.id)}
                        className={`w-full text-left rounded-xl px-3 py-3 border transition ${
                          active ? "bg-white border-orange-300" : "bg-transparent border-transparent hover:bg-white"
                        }`}
                      >
                        <div className="font-semibold text-slate-900">{r.title}</div>
                        <div className="text-xs text-slate-600 mt-1">{r.intent}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="md:col-span-2 p-6 space-y-6">
              <div>
                <div className="text-2xl font-extrabold">{selected.title}</div>
                <div className="text-sm text-slate-600 mt-1">{selected.intent}</div>
              </div>

              <RuleSection title="Green" status="green" items={selected.green} />
              <RuleSection title="Yellow" status="yellow" items={selected.yellow} />
              <RuleSection title="Red" status="red" items={selected.red} />

              <div className="space-y-2">
                <div className="font-semibold">Recommended actions</div>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                  {selected.recommendedActions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>

              <div className="text-xs text-slate-500">
                Note: Demo rulebook. In production, link each rule to the parsed command output that triggered it.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Lightweight sanity checks (not a full test runner).
 */
function __selfTest() {
  const z: Zone = { id: 1, type: "Roof + Eave", name: "Combo" };
  if (!z.name || z.id !== 1) throw new Error("Zone self-test failed");

  const w: WifiNetwork = { ssid: "X", strength: 3, security: "WPA2" };
  if (!w.ssid || w.strength < 1 || w.strength > 5) throw new Error("Wi‑Fi self-test failed");

  const statuses: DiagnosticStatus[] = ["success", "warning", "error"]; // compile-time check
  if (statuses.length !== 3) throw new Error("Status union self-test failed");

  if (wifiChannelFromFreqMHz(2412) !== "1") throw new Error("Wi‑Fi channel calc failed (2.4GHz)");
  if (wifiChannelFromFreqMHz(5180) !== "36") throw new Error("Wi‑Fi channel calc failed (5GHz)");

  if (wifiStrengthGlyph(100) !== "▮▮▮▮▮") throw new Error("Wi‑Fi strength glyph failed (100)");
  if (wifiStrengthGlyph(0) !== "▯▯▯▯▯") throw new Error("Wi‑Fi strength glyph failed (0)");

  // 9 cards exist
  const required = [
    "ethernet",
    "wifi",
    "cellular",
    "satellite",
    "power",
    "manifold",
    "source",
    "cloud",
    "firmware",
  ];
  for (const id of required) {
    if (!RULEBOOK.find((r) => r.id === id)) throw new Error(`Rulebook missing: ${id}`);
  }
}

try {
  if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
    __selfTest();
  }
} catch {
  // ignore in demo runtime
}
