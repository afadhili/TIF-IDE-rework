// Function to generate a random integer between min and max (inclusive)
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Function to pad a number with leading zeros to ensure it's at least 2 digits
function padTo2Digits(num: number): string {
  return num.toString(16).padStart(2, "0");
}

// Generate random hex color (#RRGGBB)
function randomHexColor(): string {
  const color = randomInt(0, 0xffffff);
  return `#${padTo2Digits(color)}`;
}

// Generate random RGB color (rgb(R, G, B))
function randomRgbColor(): string {
  const r = randomInt(0, 255);
  const g = randomInt(0, 255);
  const b = randomInt(0, 255);
  return `rgb(${r}, ${g}, ${b})`;
}

// Generate random HSL color (hsl(H, S, L))
function randomHslColor(): string {
  const h = randomInt(0, 360);
  const s = randomInt(0, 100);
  const l = randomInt(0, 100);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// Main color generator function
export default function generateRandomColor(): {
  hex: string;
  rgb: string;
  hsl: string;
} {
  return {
    hex: randomHexColor(),
    rgb: randomRgbColor(),
    hsl: randomHslColor(),
  };
}

// Export functions for use in other modules
export { generateRandomColor, randomHexColor, randomRgbColor, randomHslColor };
